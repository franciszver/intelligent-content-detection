"""
Lambda handler for metadata queries
Retrieves photo metadata from DynamoDB
"""
import json
import os
from typing import Dict, Any
import sys

# Add shared directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../'))

from shared.dynamodb import get_metadata


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
        
        # Convert to response format
        response_data = {
            'photo_id': metadata.photo_id,
            'timestamp': metadata.timestamp,
            's3_key': metadata.s3_key,
            'status': metadata.status,
            'detections': metadata.detections,
            'materials': metadata.materials,
        }
        
        if metadata.user_id:
            response_data['user_id'] = metadata.user_id
        if metadata.processing_time_ms:
            response_data['processing_time_ms'] = metadata.processing_time_ms
        if metadata.ai_provider:
            response_data['ai_provider'] = metadata.ai_provider
        
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

