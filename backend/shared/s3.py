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
    region: str = 'us-east-2',
    content_type: str = 'image/jpeg'
) -> Optional[str]:
    """
    Generate a presigned URL for S3 upload
    
    Args:
        bucket_name: S3 bucket name
        object_key: S3 object key
        expiration: URL expiration time in seconds
        region: AWS region
        content_type: Content type for the upload
        
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
                'ContentType': content_type
            },
            ExpiresIn=expiration
        )
        return url
    except ClientError as e:
        print(f"Error generating presigned URL: {e}")
        return None


def upload_file_to_s3(
    bucket_name: str,
    object_key: str,
    file_data: bytes,
    content_type: str = 'image/jpeg',
    region: str = 'us-east-2'
) -> bool:
    """
    Upload file directly to S3 (for proxying through API)
    
    Args:
        bucket_name: S3 bucket name
        object_key: S3 object key
        file_data: File bytes
        content_type: Content type
        region: AWS region
        
    Returns:
        True if successful, False otherwise
    """
    try:
        s3_client = get_s3_client(region)
        s3_client.put_object(
            Bucket=bucket_name,
            Key=object_key,
            Body=file_data,
            ContentType=content_type
        )
        return True
    except ClientError as e:
        print(f"Error uploading file to S3: {e}")
        return False


def generate_presigned_get_url(
    bucket_name: str,
    object_key: str,
    expiration: int = 3600,
    region: str = 'us-east-2'
) -> Optional[str]:
    """
    Generate a presigned URL for downloading an object from S3
    """
    try:
        s3_client = get_s3_client(region)
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': bucket_name,
                'Key': object_key,
            },
            ExpiresIn=expiration
        )
        return url
    except ClientError as e:
        print(f"Error generating presigned download URL: {e}")
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

