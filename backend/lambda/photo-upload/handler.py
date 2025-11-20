"""
Lambda handler for photo upload
Generates presigned URLs for direct S3 upload and creates initial metadata record
"""
import json
import os
import uuid
from datetime import datetime
from typing import Dict, Any
import sys

# Add shared directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../'))

from shared.s3 import generate_presigned_url, generate_photo_key
from shared.dynamodb import put_metadata
from shared.models import PhotoMetadata


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for photo upload
    
    Expected event:
    {
        "user_id": "optional-user-id",
        "content_type": "image/jpeg"
    }
    
    Returns:
    {
        "photo_id": "uuid",
        "upload_url": "presigned-url",
        "s3_key": "photos/user_id/photo_id.jpg"
    }
    """
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
        
        # Parse request body
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        user_id = body.get('user_id') or event.get('requestContext', {}).get('authorizer', {}).get('claims', {}).get('sub')
        content_type = body.get('content_type', 'image/jpeg')
        
        # Generate photo ID and S3 key
        photo_id = str(uuid.uuid4())
        s3_key = generate_photo_key(user_id, photo_id)
        
        # Generate presigned URL (1 hour expiration)
        upload_url = generate_presigned_url(
            bucket_name=bucket_name,
            object_key=s3_key,
            expiration=3600,
            region=region
        )
        
        if not upload_url:
            return {
                'statusCode': 500,
                'body': json.dumps({'error': 'Failed to generate upload URL'})
            }
        
        # Create initial metadata record
        metadata = PhotoMetadata(
            photo_id=photo_id,
            timestamp=datetime.utcnow().isoformat() + 'Z',
            s3_key=s3_key,
            user_id=user_id,
            status='pending'
        )
        
        # Store metadata
        success = put_metadata(table_name, metadata, region)
        
        if not success:
            print(f"Warning: Failed to store initial metadata for {photo_id}")
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'photo_id': photo_id,
                'upload_url': upload_url,
                's3_key': s3_key,
                'expires_in': 3600
            })
        }
        
    except Exception as e:
        print(f"Error in photo upload handler: {e}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({'error': str(e)})
        }

