"""
Lambda handler for the Single Agent (YOLO + CV + GPT) damage pipeline.
"""
import json
import os
import time
import traceback
from typing import Any, Dict, Optional, Tuple
import sys

# Ensure local path + Lambda layer site packages are available
CURRENT_DIR = os.path.dirname(__file__)
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

LAYER_SITE = "/opt/python/lib/python3.11/site-packages"
if os.path.isdir("/opt/python") and "/opt/python" not in sys.path:
    sys.path.append("/opt/python")
if os.path.isdir(LAYER_SITE) and LAYER_SITE not in sys.path:
    sys.path.append(LAYER_SITE)

from shared.s3 import download_image, upload_file_to_s3  # type: ignore
from shared.dynamodb import get_metadata, put_metadata  # type: ignore
from shared.models import PhotoMetadata  # type: ignore
from shared.image_utils import bbox_to_grid_coords, validate_image  # type: ignore
from shared.cv_utils import (
    annotate_damage_with_ai,
    generate_overlay,
    count_damage_instances,
    filter_large_damage_areas,
)  # type: ignore
from shared.single_agent import (
    run_yolo_inference,
    enrich_with_cv,
    summarize_with_ai,
)  # type: ignore
from shared.model_loader import get_or_create_session  # type: ignore
from ai_client import AIClient  # type: ignore


def _parse_class_names(env_value: Optional[str]) -> Optional[list[str]]:
    if not env_value:
        return None
    try:
        parsed = json.loads(env_value)
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
    except json.JSONDecodeError:
        names = [name.strip() for name in env_value.split(",") if name.strip()]
        return names or None
    return None


def _normalize_event(event: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """
    Normalize incoming event into the simple {photo_id, s3_key, user_id} payload.
    Returns (payload, is_api_gateway_event).
    """
    if not isinstance(event, dict):
        raise ValueError("Event must be a dictionary.")

    # Step Functions/direct invocation already send the expected payload
    if "photo_id" in event and "s3_key" in event and "httpMethod" not in event:
        return (
            {
                "photo_id": event.get("photo_id"),
                "s3_key": event.get("s3_key"),
                "user_id": event.get("user_id"),
            },
            False,
        )

    # API Gateway proxy event
    body: Dict[str, Any] = {}
    raw_body = event.get("body")
    if isinstance(raw_body, str):
        try:
            body = json.loads(raw_body or "{}")
        except json.JSONDecodeError:
            body = {}
    elif isinstance(raw_body, dict):
        body = raw_body

    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}

    photo_id = (
        path_params.get("photoId")
        or path_params.get("photo_id")
        or body.get("photo_id")
        or query_params.get("photo_id")
    )
    s3_key = body.get("s3_key") or query_params.get("s3_key")
    user_id = body.get("user_id")

    if not photo_id:
        raise ValueError("photo_id is required.")
    if not s3_key:
        raise ValueError("s3_key is required.")

    return ({"photo_id": photo_id, "s3_key": s3_key, "user_id": user_id}, True)


def _build_response(payload: Dict[str, Any], is_api_event: bool) -> Dict[str, Any]:
    if not is_api_event:
        return payload
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(payload),
    }


def _mark_metadata_failed(table: str, region: str, photo_id: Optional[str]) -> None:
    if not photo_id:
        return
    try:
        metadata = get_metadata(table, photo_id, region)
        if metadata:
            metadata.status = "failed"
            put_metadata(table, metadata, region)
    except Exception as error:  # pragma: no cover - best-effort failure logging
        print(f"[SingleAgent] Failed to update metadata for {photo_id}: {error}")


def _invoke_async(function_name: str, payload: Dict[str, Any], region: str) -> None:
    """Invoke Lambda function asynchronously."""
    import boto3
    client = boto3.client("lambda", region_name=region)
    client.invoke(
        FunctionName=function_name,
        InvocationType="Event",  # Async invocation
        Payload=json.dumps(payload).encode("utf-8"),
    )
    print(f"[SingleAgent] Async invocation triggered for {payload.get('photo_id')}")


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Event shape:
    {
        "photo_id": "...",
        "s3_key": "...",
        "user_id": "...",
        "workflow_id": "..." (optional),
        "_async_processing": true (internal flag for async processing)
    }
    
    For API Gateway requests, this handler returns immediately with 202 Accepted
    and invokes itself asynchronously to do the actual processing.
    """
    start_time = time.time()
    bucket_name = os.environ.get("S3_BUCKET_NAME")
    table_name = os.environ.get("DYNAMODB_TABLE_NAME")
    region = os.environ.get("REGION", "us-east-2")
    model_bucket = os.environ.get("MODEL_BUCKET_NAME", bucket_name)
    model_key = os.environ.get("YOLO_MODEL_KEY", "models/yolov8s-roof.onnx")
    overlay_prefix = os.environ.get("SINGLE_AGENT_OVERLAY_PREFIX", "single-agent/overlays")
    report_prefix = os.environ.get("SINGLE_AGENT_REPORT_PREFIX", "single-agent/reports")
    class_names = _parse_class_names(os.environ.get("YOLO_CLASS_NAMES"))

    if not bucket_name or not table_name or not model_bucket or not model_key:
        raise ValueError("Missing required environment variables for single agent handler.")

    payload, is_api_event = _normalize_event(event)
    photo_id = payload["photo_id"]
    s3_key = payload["s3_key"]
    user_id = payload.get("user_id")
    
    # Check if this is an async processing invocation (not from API Gateway)
    is_async_processing = event.get("_async_processing", False)

    # For API Gateway requests, return immediately and process asynchronously
    if is_api_event and not is_async_processing:
        print(f"[SingleAgent] API request received for {photo_id}, triggering async processing")
        
        # Update status to "processing" in DynamoDB
        try:
            metadata = get_metadata(table_name, photo_id, region)
            if metadata:
                metadata.status = "processing"
                put_metadata(table_name, metadata, region)
            else:
                # Create initial metadata if it doesn't exist
                metadata = PhotoMetadata(
                    photo_id=photo_id,
                    timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    s3_key=s3_key,
                    status="processing",
                )
                put_metadata(table_name, metadata, region)
        except Exception as e:
            print(f"[SingleAgent] Warning: Could not update metadata status: {e}")
        
        # Invoke self asynchronously
        async_payload = {
            "photo_id": photo_id,
            "s3_key": s3_key,
            "user_id": user_id,
            "_async_processing": True,
        }
        _invoke_async(context.function_name, async_payload, region)
        
        # Return 202 Accepted immediately
        return {
            "statusCode": 202,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({
                "photo_id": photo_id,
                "status": "processing",
                "message": "Analysis started. Poll /photos/{photoId}/metadata for results.",
            }),
        }

    print(f"[SingleAgent] Starting analysis for {photo_id} ({s3_key})")

    metadata = None
    try:
        # Download source image
        image_bytes = download_image(bucket_name, s3_key, region)
        if not image_bytes:
            raise FileNotFoundError(f"Image {s3_key} was not found in bucket {bucket_name}.")

        is_valid, error_msg = validate_image(image_bytes)
        if not is_valid:
            raise ValueError(f"Invalid image: {error_msg}")

        from PIL import Image
        import io

        img = Image.open(io.BytesIO(image_bytes))
        image_width, image_height = img.size

        # Load YOLO model session
        session = get_or_create_session(model_bucket, model_key, region)

        ai_client = AIClient()

        yolo_detections = run_yolo_inference(
            image_bytes,
            session=session,
            class_names=class_names,
            conf_threshold=float(os.environ.get("YOLO_CONF_THRESHOLD", "0.3")),
            iou_threshold=float(os.environ.get("YOLO_IOU_THRESHOLD", "0.45")),
        )
        print(f"[SingleAgent] YOLO detections: {len(yolo_detections)}")

        # Merge with CV heuristics
        damage_areas = enrich_with_cv(image_bytes, yolo_detections)
        print(f"[SingleAgent] After CV merge: {len(damage_areas)} detections")

        # Refine via GPT classification and metadata
        if damage_areas:
            damage_areas = annotate_damage_with_ai(
                image_bytes,
                damage_areas,
                ai_client,
                task="missing shingles, torn shingles, hail impact, discoloration, structural cracks",
            )

        damage_areas = filter_large_damage_areas(damage_areas, image_width, image_height)

        # Add grid coordinates for easier UI mapping
        for area in damage_areas:
            bbox = area.get("bbox")
            if bbox and len(bbox) == 4:
                area["grid_coords"] = bbox_to_grid_coords(bbox, image_width, image_height)

        counts = count_damage_instances(damage_areas)

        summary_text, recommendations, ai_provider, gpt_response = summarize_with_ai(
            ai_client,
            image_bytes,
            damage_areas,
        )

        overlay_bytes = generate_overlay(
            image_bytes,
            damage_areas,
            damage_types=[area.get("damage_type", "unknown") for area in damage_areas],
            counts=counts,
        )
        timestamp = int(time.time())
        overlay_key = f"{overlay_prefix}/{photo_id}-{timestamp}.png"
        upload_file_to_s3(
            bucket_name,
            overlay_key,
            overlay_bytes,
            content_type="image/png",
            region=region,
        )

        report_payload = {
            "photo_id": photo_id,
            "generated_at": timestamp,
            "summary": summary_text,
            "recommendations": recommendations,
            "counts": counts,
            "detections": damage_areas,
            "ai_provider": ai_provider,
            "gpt_response": gpt_response,
        }
        report_bytes = json.dumps(report_payload, default=str, indent=2).encode("utf-8")
        report_key = f"{report_prefix}/{photo_id}-{timestamp}.json"
        upload_file_to_s3(
            bucket_name,
            report_key,
            report_bytes,
            content_type="application/json",
            region=region,
        )

        processing_time_ms = int((time.time() - start_time) * 1000)
        single_agent_record = {
            "model_version": os.environ.get("SINGLE_AGENT_MODEL_VERSION", "single-agent-v1"),
            "damage_areas": damage_areas,
            "damage_counts": counts,
            "ai_summary": summary_text,
            "ai_recommendations": recommendations,
            "ai_provider": ai_provider,
            "gpt_response": gpt_response,
            "processing_time_ms": processing_time_ms,
        }

        metadata = get_metadata(table_name, photo_id, region)
        if not metadata:
            metadata = PhotoMetadata(
                photo_id=photo_id,
                timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                s3_key=s3_key,
                status="processing",
                user_id=user_id,
            )

        # Map detections into the generic detections array for backwards compatibility
        metadata.detections = [
            {
                "type": "roof_damage",
                "category": area.get("damage_type", "unknown"),
                "confidence": area.get("confidence", 0.0),
                "bbox": area.get("bbox"),
                "severity": area.get("severity"),
            }
            for area in damage_areas
            if area.get("bbox")
        ]
        metadata.materials = metadata.materials or []
        metadata.status = "completed"
        metadata.processing_time_ms = processing_time_ms
        metadata.ai_provider = ai_provider or metadata.ai_provider
        metadata.single_agent_results = single_agent_record
        metadata.single_agent_overlay_s3_key = overlay_key
        metadata.single_agent_report_s3_key = report_key
        put_metadata(table_name, metadata, region)

        print(f"[SingleAgent] Completed {photo_id} in {processing_time_ms} ms")

        response_payload = {
            "photo_id": photo_id,
            "status": "completed",
            "single_agent_results": single_agent_record,
            "single_agent_overlay_key": overlay_key,
            "single_agent_report_key": report_key,
        }

        return _build_response(response_payload, is_api_event)
    except Exception as exc:
        error_traceback = traceback.format_exc()
        print(f"[SingleAgent] Error processing {photo_id}: {exc}")
        print(f"[SingleAgent] Traceback:\n{error_traceback}")
        _mark_metadata_failed(table_name, region, photo_id)
        if is_api_event:
            return {
                "statusCode": 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"error": str(exc), "traceback": error_traceback}),
            }
        raise

