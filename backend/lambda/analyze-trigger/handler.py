"""
Lambda handler to trigger Step Functions execution for multi-agent analysis
"""
import json
import os
import time
import boto3
from typing import Dict, Any
import sys

sys.path.insert(0, os.path.dirname(__file__))


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler to start Step Functions execution
    
    Expected event from API Gateway:
    {
        "pathParameters": {
            "photoId": "uuid"
        },
        "body": {
            "s3_key": "optional"
        }
    }
    """
    try:
        # Get environment variables
        state_machine_arn_param = os.environ.get('STATE_MACHINE_ARN_PARAM')
        table_name = os.environ.get('DYNAMODB_TABLE_NAME')
        region = os.environ.get('REGION', 'us-east-2')
        
        # Get state machine ARN from SSM Parameter Store
        state_machine_arn = None
        if state_machine_arn_param:
            try:
                ssm_client = boto3.client('ssm', region_name=region)
                response = ssm_client.get_parameter(Name=state_machine_arn_param)
                state_machine_arn = response['Parameter']['Value']
            except Exception as e:
                print(f"Warning: Could not get state machine ARN from SSM: {e}")
        
        if not state_machine_arn:
            return {
                'statusCode': 500,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                'body': json.dumps({'error': 'STATE_MACHINE_ARN not configured'})
            }
        
        # Get photo_id from path parameters
        path_params = event.get('pathParameters', {})
        photo_id = path_params.get('photoId') or path_params.get('photo_id')
        
        if not photo_id:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                'body': json.dumps({'error': 'Missing photoId parameter'})
            }
        
        # Get s3_key from body or metadata
        s3_key = None
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        s3_key = body.get('s3_key')
        
        # If s3_key not provided, get from metadata
        if not s3_key and table_name:
            try:
                from shared.dynamodb import get_metadata
                metadata = get_metadata(table_name, photo_id, region)
                if metadata:
                    s3_key = metadata.s3_key
            except Exception as e:
                print(f"Warning: Could not get s3_key from metadata: {e}")
        
        if not s3_key:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                'body': json.dumps({'error': 'Missing s3_key'})
            }
        
        # Start Step Functions execution
        stepfunctions = boto3.client('stepfunctions', region_name=region)
        
        execution_input = {
            'photo_id': photo_id,
            's3_key': s3_key
        }
        
        execution_name = f"{photo_id}-{int(time.time())}"
        response = stepfunctions.start_execution(
            stateMachineArn=state_machine_arn,
            name=execution_name,
            input=json.dumps(execution_input)
        )
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'photo_id': photo_id,
                'execution_arn': response['executionArn'],
                'start_date': response['startDate'].isoformat(),
                'workflow_status': 'processing'
            })
        }
        
    except Exception as e:
        print(f"Error in analyze trigger handler: {e}")
        import traceback
        traceback.print_exc()
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({'error': str(e)})
        }

