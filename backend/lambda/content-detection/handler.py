"""
Lambda handler for content detection
Processes images and calls AI services for content detection
"""
import json
import os
import time
from datetime import datetime
from typing import Dict, Any
import sys

# Add shared directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../'))

from shared.s3 import download_image
from shared.dynamodb import get_metadata, put_metadata
from shared.models import PhotoMetadata
from shared.image_utils import resize_image_if_needed, validate_image
from ai_client import AIClient
from response_parser import ResponseParser
from prompts import COMBINED_PROMPT


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for content detection
    
    Can be triggered by:
    1. S3 event (when photo is uploaded)
    2. API Gateway request (manual trigger)
    
    Expected API event:
    {
        "body": {
            "photo_id": "uuid",
            "s3_key": "optional-if-provided"
        }
    }
    
    S3 event:
    {
        "Records": [{
            "s3": {
                "bucket": {"name": "bucket-name"},
                "object": {"key": "photos/..."}
            }
        }]
    }
    """
    start_time = time.time()
    
    try:
        # Get environment variables
        bucket_name = os.environ.get('S3_BUCKET_NAME')
        table_name = os.environ.get('DYNAMODB_TABLE_NAME')
        region = os.environ.get('REGION', 'us-east-2')
        
        if not bucket_name or not table_name:
            return {
                'statusCode': 500,
                'body': json.dumps({'error': 'Missing environment variables'})
            }
        
        # Determine trigger type and get photo info
        photo_id = None
        s3_key = None
        
        # Check if triggered by S3 event
        if 'Records' in event and len(event['Records']) > 0:
            record = event['Records'][0]
            if 's3' in record:
                s3_key = record['s3']['object']['key']
                # Extract photo_id from key (photos/user_id/photo_id.jpg)
                parts = s3_key.split('/')
                if len(parts) >= 2:
                    filename = parts[-1]
                    photo_id = filename.replace('.jpg', '').replace('.jpeg', '').replace('.png', '')
        else:
            # API Gateway trigger
            if isinstance(event.get('body'), str):
                body = json.loads(event['body'])
            else:
                body = event.get('body', {})
            
            photo_id = body.get('photo_id')
            s3_key = body.get('s3_key')
            
            # If s3_key not provided, get from metadata
            if not s3_key and photo_id:
                metadata = get_metadata(table_name, photo_id, region)
                if metadata:
                    s3_key = metadata.s3_key
        
        if not photo_id or not s3_key:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing photo_id or s3_key'})
            }
        
        # Download image from S3
        image_bytes = download_image(bucket_name, s3_key, region)
        if not image_bytes:
            # Update metadata with failed status
            metadata = get_metadata(table_name, photo_id, region)
            if metadata:
                metadata.status = 'failed'
                put_metadata(table_name, metadata, region)
            
            return {
                'statusCode': 404,
                'body': json.dumps({'error': 'Image not found in S3'})
            }
        
        # Validate image
        is_valid, error_msg = validate_image(image_bytes)
        if not is_valid:
            metadata = get_metadata(table_name, photo_id, region)
            if metadata:
                metadata.status = 'failed'
                put_metadata(table_name, metadata, region)
            
            return {
                'statusCode': 400,
                'body': json.dumps({'error': f'Invalid image: {error_msg}'})
            }
        
        # Resize image if needed (optimize for AI processing)
        image_bytes, was_resized = resize_image_if_needed(image_bytes, max_width=2048, max_height=2048)
        
        # Update status to processing
        metadata = get_metadata(table_name, photo_id, region)
        if metadata:
            metadata.status = 'processing'
            put_metadata(table_name, metadata, region)
        
        # Initialize AI client and parser
        ai_client = AIClient()
        parser = ResponseParser()
        
        # Call AI service
        result, provider = ai_client.detect_content(image_bytes, COMBINED_PROMPT)
        
        if not result:
            # Update metadata with failed status
            if metadata:
                metadata.status = 'failed'
                put_metadata(table_name, metadata, region)
            
            return {
                'statusCode': 500,
                'body': json.dumps({'error': 'AI detection failed'})
            }
        
        # Parse and validate response
        if not parser.validate_response(result):
            print(f"Warning: Invalid response structure from {provider}")
        
        parsed_result = parser.parse_response(result)
        
        # Calculate processing time
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        # Update metadata with results
        if metadata:
            metadata.status = 'completed'
            metadata.detections = parsed_result['detections']
            metadata.materials = parsed_result['materials']
            metadata.processing_time_ms = processing_time_ms
            metadata.ai_provider = provider
            put_metadata(table_name, metadata, region)
        else:
            # Create new metadata if not found
            metadata = PhotoMetadata(
                photo_id=photo_id,
                timestamp=datetime.utcnow().isoformat() + 'Z',
                s3_key=s3_key,
                status='completed',
                detections=parsed_result['detections'],
                materials=parsed_result['materials'],
                processing_time_ms=processing_time_ms,
                ai_provider=provider
            )
            put_metadata(table_name, metadata, region)
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'photo_id': photo_id,
                'status': 'completed',
                'detections': parsed_result['detections'],
                'materials': parsed_result['materials'],
                'processing_time_ms': processing_time_ms,
                'ai_provider': provider
            })
        }
        
    except Exception as e:
        print(f"Error in content detection handler: {e}")
        import traceback
        traceback.print_exc()
        
        # Try to update metadata with failed status
        try:
            if photo_id:
                metadata = get_metadata(table_name, photo_id, region)
                if metadata:
                    metadata.status = 'failed'
                    put_metadata(table_name, metadata, region)
        except:
            pass
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({'error': str(e)})
        }

