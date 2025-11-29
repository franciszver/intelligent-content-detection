import json
import os
import time
from typing import Any, Dict

import boto3
from boto3.dynamodb.conditions import Key


CONNECTIONS_TABLE = os.environ.get('WEBSOCKET_TABLE_NAME')
CONNECTION_INDEX = os.environ.get('CONNECTION_INDEX_NAME', 'connection-index')
REGION = os.environ.get('REGION', 'us-east-2')

dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(CONNECTIONS_TABLE) if CONNECTIONS_TABLE else None


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle WebSocket connect/disconnect/subscribe events.
    Route selection is based on $request.body.action, but we also create an explicit
    'subscribe' route for clarity.
    """
    route_key = event.get('requestContext', {}).get('routeKey')
    connection_id = event.get('requestContext', {}).get('connectionId')
    print(f"WebSocket route={route_key} connection={connection_id}")

    if route_key == '$connect':
        return _ok()

    if route_key == '$disconnect':
        _remove_connection(connection_id)
        return _ok()

    if route_key in ('$default', 'subscribe'):
        return _handle_subscribe(event, connection_id)

    return _ok()


def _handle_subscribe(event: Dict[str, Any], connection_id: str) -> Dict[str, Any]:
    if not table:
        return _error('WebSocket table not configured')

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _error('Invalid JSON payload')

    photo_id = body.get('photo_id')
    if not photo_id:
        return _error('photo_id is required')

    ttl = int(time.time()) + 60 * 60 * 24  # 24h
    item = {
        'photo_id': photo_id,
        'connection_id': connection_id,
        'ttl': ttl,
    }
    table.put_item(Item=item)
    print(f"Subscribed connection={connection_id} to photo={photo_id}")
    return _ok({'subscribed': photo_id})


def _remove_connection(connection_id: str) -> None:
    if not table or not connection_id:
        return

    try:
        response = table.query(
            IndexName=CONNECTION_INDEX,
            KeyConditionExpression=Key('connection_id').eq(connection_id),
        )
    except Exception as exc:  # pragma: no cover - defensive
        print(f"Failed to query connections for {connection_id}: {exc}")
        return

    for item in response.get('Items', []):
        try:
            table.delete_item(
                Key={
                    'photo_id': item['photo_id'],
                    'connection_id': item['connection_id'],
                }
            )
            print(f"Removed stale connection={connection_id} for photo={item['photo_id']}")
        except Exception as exc:  # pragma: no cover
            print(f"Failed to delete connection mapping: {exc}")


def _ok(body: Any = None) -> Dict[str, Any]:
    return {
        'statusCode': 200,
        'body': json.dumps(body or {'ok': True}),
    }


def _error(message: str) -> Dict[str, Any]:
    print(f"WebSocket error: {message}")
    return {
        'statusCode': 400,
        'body': json.dumps({'error': message}),
    }

