"""
Lambda handler for the Single Agent (YOLO + CV + GPT) damage pipeline.
"""
import json
import os
import time
from typing import Any, Dict, Optional
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


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Event shape:
    {
        "photo_id": "...",
        "s3_key": "...",
        "user_id": "...",
        "workflow_id": "..." (optional)
    }
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

    photo_id = event.get("photo_id")
    s3_key = event.get("s3_key")
    if not photo_id or not s3_key:
        raise ValueError("Event must include photo_id and s3_key.")

    print(f"[SingleAgent] Starting analysis for {photo_id} ({s3_key})")

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
        )

    metadata.single_agent_results = single_agent_record
    metadata.single_agent_overlay_s3_key = overlay_key
    metadata.single_agent_report_s3_key = report_key
    put_metadata(table_name, metadata, region)

    print(f"[SingleAgent] Completed {photo_id} in {processing_time_ms} ms")

    return {
        "photo_id": photo_id,
        "single_agent_summary": {
            "damage_area_count": len(damage_areas),
            "overlay_generated": True,
            "ai_provider": ai_provider,
            "processing_time_ms": processing_time_ms,
        },
        "single_agent_overlay_key": overlay_key,
        "single_agent_report_key": report_key,
    }

