"""
DynamoDB operations for metadata storage
"""
import os
import boto3
from botocore.exceptions import ClientError
from typing import Optional, Dict, Any
from backend.shared.models import PhotoMetadata


def get_dynamodb_client(region: str = 'us-east-2'):
    """Get DynamoDB client"""
    return boto3.client('dynamodb', region_name=region)


def get_dynamodb_resource(region: str = 'us-east-2'):
    """Get DynamoDB resource"""
    return boto3.resource('dynamodb', region_name=region)


def put_metadata(
    table_name: str,
    metadata: PhotoMetadata,
    region: str = 'us-east-2'
) -> bool:
    """
    Store photo metadata in DynamoDB
    
    Args:
        table_name: DynamoDB table name
        metadata: PhotoMetadata object
        region: AWS region
        
    Returns:
        True if successful, False otherwise
    """
    try:
        dynamodb = get_dynamodb_resource(region)
        table = dynamodb.Table(table_name)
        
        item = metadata.to_dynamodb_item()
        # Resource API handles type conversion automatically
        table.put_item(Item=item)
        return True
    except ClientError as e:
        print(f"Error storing metadata: {e}")
        return False
    except Exception as e:
        print(f"Unexpected error: {e}")
        return False


def get_metadata(
    table_name: str,
    photo_id: str,
    region: str = 'us-east-2'
) -> Optional[PhotoMetadata]:
    """
    Retrieve photo metadata from DynamoDB
    
    Args:
        table_name: DynamoDB table name
        photo_id: Photo ID
        region: AWS region
        
    Returns:
        PhotoMetadata object or None if not found
    """
    try:
        dynamodb = get_dynamodb_resource(region)
        table = dynamodb.Table(table_name)
        
        response = table.get_item(Key={'photo_id': photo_id})
        
        if 'Item' in response:
            return PhotoMetadata.from_dynamodb_item(response['Item'])
        else:
            return None
    except ClientError as e:
        print(f"Error retrieving metadata: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        return None

