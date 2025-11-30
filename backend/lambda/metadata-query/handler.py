"""
Lambda handler for metadata queries
Retrieves photo metadata from DynamoDB
"""
import json
import os
from typing import Dict, Any
from decimal import Decimal
import sys

# Add Lambda root directory to path (where shared module is located)
sys.path.insert(0, os.path.dirname(__file__))

from shared.dynamodb import get_metadata
from shared.s3 import generate_presigned_get_url


def convert_decimals(obj: Any) -> Any:
    """Recursively convert Decimal types to float/int for JSON serialization"""
    if isinstance(obj, Decimal):
        # Convert Decimal to float (or int if it's a whole number)
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    elif isinstance(obj, dict):
        return {key: convert_decimals(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimals(item) for item in obj]
    return obj


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for metadata query
    
    Expected event:
    {
        "pathParameters": {
            "photoId": "uuid"
        }
    }
    
    Returns:
    {
        "photo_id": "uuid",
        "status": "completed",
        "detections": [...],
        "materials": [...],
        ...
    }
    """
    try:
        # Get environment variables
        table_name = os.environ.get('DYNAMODB_TABLE_NAME')
        region = os.environ.get('REGION', 'us-east-2')
        bucket_name = os.environ.get('S3_BUCKET_NAME')
        
        if not table_name:
            return {
                'statusCode': 500,
                'body': json.dumps({'error': 'Missing environment variables'})
            }
        
        # Get photo_id from path parameters
        path_params = event.get('pathParameters', {})
        photo_id = path_params.get('photoId') or path_params.get('photo_id')
        
        if not photo_id:
            # Try from query string
            query_params = event.get('queryStringParameters', {})
            photo_id = query_params.get('photo_id') if query_params else None
        
        if not photo_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing photo_id parameter'})
            }
        
        # Retrieve metadata
        metadata = get_metadata(table_name, photo_id, region)
        
        if not metadata:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                'body': json.dumps({'error': 'Photo not found'})
            }
        
        # Convert to response format - use model_dump() to get dict representation
        # This ensures we get the actual values, not Pydantic model instances
        response_data = {
            'photo_id': metadata.photo_id,
            'timestamp': metadata.timestamp,
            's3_key': metadata.s3_key,
            'status': metadata.status,
            'detections': metadata.detections,
            'materials': metadata.materials,
            'single_agent_results': metadata.single_agent_results,
            'single_agent_overlay_s3_key': metadata.single_agent_overlay_s3_key,
            'single_agent_report_s3_key': metadata.single_agent_report_s3_key,
        }
        
        if metadata.user_id:
            response_data['user_id'] = metadata.user_id
        if metadata.processing_time_ms:
            response_data['processing_time_ms'] = metadata.processing_time_ms
        if metadata.ai_provider:
            response_data['ai_provider'] = metadata.ai_provider
        
        # Generate presigned URLs for overlay/report if available
        if bucket_name and metadata.single_agent_overlay_s3_key:
            single_overlay = generate_presigned_get_url(bucket_name, metadata.single_agent_overlay_s3_key, region=region)
            if single_overlay:
                response_data['single_agent_overlay_url'] = single_overlay
        if bucket_name and metadata.single_agent_report_s3_key:
            single_report = generate_presigned_get_url(bucket_name, metadata.single_agent_report_s3_key, region=region)
            if single_report:
                response_data['single_agent_report_url'] = single_report
        
        # Convert any Decimal types to float/int for JSON serialization
        # This must be done AFTER all data is added to response_data
        response_data = convert_decimals(response_data)
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps(response_data)
        }
        
    except Exception as e:
        print(f"Error in metadata query handler: {e}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({'error': str(e)})
        }

