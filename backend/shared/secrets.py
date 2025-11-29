"""
Secrets Manager client for retrieving API keys
"""
import os
import json
import boto3
from botocore.exceptions import ClientError
from typing import Optional


def get_secret(secret_name: str, region: str = 'us-east-2') -> Optional[str]:
    """
    Retrieve a secret from AWS Secrets Manager
    
    Args:
        secret_name: Name of the secret
        region: AWS region
        
    Returns:
        Secret value as string, or None if not found
    """
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region
    )
    
    try:
        get_secret_value_response = client.get_secret_value(
            SecretId=secret_name
        )
        
        # Secrets Manager can store secrets as string or JSON
        if 'SecretString' in get_secret_value_response:
            secret = get_secret_value_response['SecretString']
            # Try to parse as JSON, fallback to string
            try:
                secret_dict = json.loads(secret)
                # If it's a dict, try to get the key or return the whole dict
                if isinstance(secret_dict, dict):
                    # Common patterns: check for 'api_key', 'key', or return first value
                    return secret_dict.get('api_key') or secret_dict.get('key') or list(secret_dict.values())[0]
                return secret
            except json.JSONDecodeError:
                return secret
        else:
            # Binary secret
            import base64
            decoded_binary_secret = base64.b64decode(
                get_secret_value_response['SecretBinary']
            )
            return decoded_binary_secret.decode('utf-8')
            
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == 'ResourceNotFoundException':
            print(f"Secret {secret_name} not found")
        elif error_code == 'InvalidRequestException':
            print(f"Invalid request for secret {secret_name}")
        elif error_code == 'InvalidParameterException':
            print(f"Invalid parameter for secret {secret_name}")
        elif error_code == 'DecryptionFailureException':
            print(f"Decryption failure for secret {secret_name}")
        elif error_code == 'InternalServiceErrorException':
            print(f"Internal service error for secret {secret_name}")
        else:
            print(f"Error retrieving secret: {e}")
        return None


def get_openai_key() -> Optional[str]:
    """Get OpenAI API key from Secrets Manager"""
    secret_name = os.environ.get('OPENAI_SECRET_NAME', 'openai-api-key')
    region = os.environ.get('REGION', 'us-east-2')
    return get_secret(secret_name, region)


def get_openrouter_key() -> Optional[str]:
    """Get OpenRouter API key from Secrets Manager"""
    secret_name = os.environ.get('OPENROUTER_SECRET_NAME', 'openrouter-api-key')
    region = os.environ.get('REGION', 'us-east-2')
    return get_secret(secret_name, region)

