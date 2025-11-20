"""
S3 operations for photo storage
"""
import os
import boto3
from botocore.exceptions import ClientError
from typing import Optional
import uuid


def get_s3_client(region: str = 'us-east-2'):
    """Get S3 client"""
    return boto3.client('s3', region_name=region)


def generate_presigned_url(
    bucket_name: str,
    object_key: str,
    expiration: int = 3600,
    region: str = 'us-east-2'
) -> Optional[str]:
    """
    Generate a presigned URL for S3 upload
    
    Args:
        bucket_name: S3 bucket name
        object_key: S3 object key
        expiration: URL expiration time in seconds
        region: AWS region
        
    Returns:
        Presigned URL or None if error
    """
    try:
        s3_client = get_s3_client(region)
        url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket_name,
                'Key': object_key,
                'ContentType': 'image/jpeg'
            },
            ExpiresIn=expiration
        )
        return url
    except ClientError as e:
        print(f"Error generating presigned URL: {e}")
        return None


def download_image(bucket_name: str, object_key: str, region: str = 'us-east-2') -> Optional[bytes]:
    """
    Download image from S3
    
    Args:
        bucket_name: S3 bucket name
        object_key: S3 object key
        region: AWS region
        
    Returns:
        Image bytes or None if error
    """
    try:
        s3_client = get_s3_client(region)
        response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        return response['Body'].read()
    except ClientError as e:
        print(f"Error downloading image: {e}")
        return None


def generate_photo_key(user_id: Optional[str] = None, photo_id: Optional[str] = None) -> str:
    """
    Generate S3 key for photo
    
    Args:
        user_id: User ID (optional)
        photo_id: Photo ID (optional, generates UUID if not provided)
        
    Returns:
        S3 key path
    """
    if photo_id is None:
        photo_id = str(uuid.uuid4())
    
    if user_id:
        return f"photos/{user_id}/{photo_id}.jpg"
    else:
        return f"photos/{photo_id}.jpg"

