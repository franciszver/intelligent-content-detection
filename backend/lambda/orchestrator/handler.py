"""
Lambda handler for orchestrator - coordinates multi-agent workflow
"""
import json
import os
import sys
import time
from typing import Any, Dict, List

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

# Add Lambda root directory to path (where shared module is located)
sys.path.insert(0, os.path.dirname(__file__))

from shared.dynamodb import get_metadata, put_metadata
from shared.models import PhotoMetadata

REGION = os.environ.get('REGION', 'us-east-2')
WEBSOCKET_TABLE = os.environ.get('WEBSOCKET_TABLE_NAME')
WEBSOCKET_API_ENDPOINT = os.environ.get('WEBSOCKET_API_ENDPOINT')
CONNECTION_INDEX = os.environ.get('WEBSOCKET_CONNECTION_INDEX', 'connection-index')

dynamodb = boto3.resource('dynamodb', region_name=REGION)
connections_table = dynamodb.Table(WEBSOCKET_TABLE) if WEBSOCKET_TABLE else None
_apigw_client = None


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for orchestrator
    
    Expected event:
    {
        "photo_id": "uuid",
        "s3_key": "photos/user_id/photo_id.jpg"
    }
    """
    try:
        # Get environment variables
        table_name = os.environ.get('DYNAMODB_TABLE_NAME')
        region = os.environ.get('REGION', 'us-east-2')
        
        if not table_name:
            raise ValueError('Missing environment variables')
        
        # Handle status forwarding (called by Step Functions mid-workflow)
        status_update = event.get('status_update')
        photo_id = event.get('photo_id')

        if status_update:
            if not photo_id:
                raise ValueError('Missing photo_id for status update')
            _publish_status(photo_id, status_update)
            return {
                'photo_id': photo_id,
                'workflow_status': status_update.get('status', 'unknown'),
            }

        # Standard orchestrator invocation at workflow start
        s3_key = event.get('s3_key')
        
        if not photo_id or not s3_key:
            raise ValueError('Missing photo_id or s3_key')
        
        # Update metadata with processing status
        metadata = get_metadata(table_name, photo_id, region)
        if not metadata:
            # Create new metadata if not found
            metadata = PhotoMetadata(
                photo_id=photo_id,
                timestamp=time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                s3_key=s3_key,
                status='processing',
                workflow_status='processing'
            )
        else:
            metadata.workflow_status = 'processing'
            metadata.status = 'processing'
        
        put_metadata(table_name, metadata, region)

        _publish_status(photo_id, {
            'event': 'workflow',
            'stage': 'orchestrator',
            'status': 'processing',
            'timestamp': time.time(),
        })
        
        return {
            'photo_id': photo_id,
            's3_key': s3_key,
            'workflow_status': 'processing'
        }
        
    except Exception as e:
        print(f"Error in orchestrator handler: {e}")
        import traceback
        traceback.print_exc()
        if event.get('photo_id'):
            _publish_status(event['photo_id'], {
                'event': 'workflow',
                'stage': 'orchestrator',
                'status': 'failed',
                'error': str(e),
                'timestamp': time.time(),
            })
        raise


def _publish_status(photo_id: str, payload: Dict[str, Any]) -> None:
    """Send status payload to all websocket subscribers for this photo."""
    if not connections_table or not WEBSOCKET_API_ENDPOINT:
        print('Websocket not configured; skipping status publish')
        return
    
    client = _get_apigateway_client()
    payload = {**payload, 'photo_id': photo_id}
    data = json.dumps(payload).encode('utf-8')
    
    try:
        response = connections_table.query(
            KeyConditionExpression=Key('photo_id').eq(photo_id)
        )
    except ClientError as exc:
        print(f"Failed to query websocket connections: {exc}")
        return
    
    stale_connections: List[Dict[str, str]] = []
    for item in response.get('Items', []):
        connection_id = item.get('connection_id')
        if not connection_id:
            continue
        try:
            client.post_to_connection(ConnectionId=connection_id, Data=data)
            print(f"Published status to connection={connection_id} payload={payload}")
        except client.exceptions.GoneException:
            stale_connections.append(item)
        except ClientError as exc:
            print(f"Failed to post to connection {connection_id}: {exc}")
    
    # Clean up stale connections
    for item in stale_connections:
        try:
            connections_table.delete_item(
                Key={
                    'photo_id': item['photo_id'],
                    'connection_id': item['connection_id'],
                }
            )
            print(f"Removed stale connection {item['connection_id']}")
        except ClientError as exc:
            print(f"Failed to remove stale connection: {exc}")


def _get_apigateway_client():
    global _apigw_client
    if not _apigw_client and WEBSOCKET_API_ENDPOINT:
        _apigw_client = boto3.client(
            'apigatewaymanagementapi',
            endpoint_url=WEBSOCKET_API_ENDPOINT,
            region_name=REGION,
        )
    return _apigw_client

