"""
Return the single-agent analysis block for a given photo.
"""
import json
import os
from typing import Any, Dict
import sys

sys.path.insert(0, os.path.dirname(__file__))

from shared.dynamodb import get_metadata  # type: ignore
from shared.s3 import generate_presigned_get_url  # type: ignore


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    table_name = os.environ.get("DYNAMODB_TABLE_NAME")
    region = os.environ.get("REGION", "us-east-2")
    bucket_name = os.environ.get("S3_BUCKET_NAME")

    if not table_name:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "Missing DYNAMODB_TABLE_NAME"}),
        }

    path_params = event.get("pathParameters") or {}
    photo_id = path_params.get("photoId") or path_params.get("photo_id")
    if not photo_id:
        query_params = event.get("queryStringParameters") or {}
        photo_id = query_params.get("photo_id")

    if not photo_id:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "photo_id is required"}),
        }

    metadata = get_metadata(table_name, photo_id, region)
    if not metadata or not metadata.single_agent_results:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "Single agent results not found"}),
        }

    response_payload: Dict[str, Any] = {
        "photo_id": photo_id,
        "single_agent_results": metadata.single_agent_results,
        "single_agent_overlay_key": metadata.single_agent_overlay_s3_key,
        "single_agent_report_key": metadata.single_agent_report_s3_key,
    }

    if bucket_name and metadata.single_agent_overlay_s3_key:
        overlay_url = generate_presigned_get_url(
            bucket_name,
            metadata.single_agent_overlay_s3_key,
            region=region,
        )
        if overlay_url:
            response_payload["single_agent_overlay_url"] = overlay_url

    if bucket_name and metadata.single_agent_report_s3_key:
        report_url = generate_presigned_get_url(
            bucket_name,
            metadata.single_agent_report_s3_key,
            region=region,
        )
        if report_url:
            response_payload["single_agent_report_url"] = report_url

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(response_payload),
    }

