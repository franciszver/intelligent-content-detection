"""
Lambda handler for Agent 2 - Color enhancement and discoloration detection
"""
import os
import base64
import time
from typing import Dict, Any
import sys
import json

# Ensure local module path and Lambda layer site-packages are available
current_dir = os.path.dirname(__file__)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

LAYER_SITE = '/opt/python/lib/python3.11/site-packages'
if os.path.isdir('/opt/python') and '/opt/python' not in sys.path:
    sys.path.append('/opt/python')
if os.path.isdir(LAYER_SITE) and LAYER_SITE not in sys.path:
    sys.path.append(LAYER_SITE)

from shared.s3 import download_image
from shared.dynamodb import get_metadata, put_metadata
from shared.models import PhotoMetadata
from shared.image_utils import bbox_to_grid_coords, validate_image
from shared.cv_utils import (
    enhance_colors,
    detect_discoloration,
    detect_discoloration_cv,
    annotate_damage_with_ai,
    merge_damage_areas
)
from ai_client import AIClient


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for color enhancement and discoloration detection
    
    Expected event:
    {
        "photo_id": "uuid",
        "s3_key": "photos/user_id/photo_id.jpg"
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
        
        print(f"[Agent2] Starting color analysis for event: {event}")
        # Get photo info from event
        photo_id = event.get('photo_id')
        s3_key = event.get('s3_key')
        
        if not photo_id or not s3_key:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing photo_id or s3_key'})
            }
        
        print(f"[Agent2] Downloading image {s3_key} for photo {photo_id}")
        # Download original image from S3
        image_bytes = download_image(bucket_name, s3_key, region)
        if not image_bytes:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': 'Image not found in S3'})
            }
        
        # Validate image
        is_valid, error_msg = validate_image(image_bytes)
        if not is_valid:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': f'Invalid image: {error_msg}'})
            }
        
        # Get image dimensions for grid conversion
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(image_bytes))
        image_width, image_height = img.size
        
        # Initialize AI client
        ai_client = AIClient()
        
        # Phase 1: Color enhancement
        enhancement_start = time.time()
        enhanced_image_bytes = enhance_colors(image_bytes)
        enhanced_image_base64 = base64.b64encode(enhanced_image_bytes).decode('utf-8')
        print(f"Color enhancement took {(time.time() - enhancement_start) * 1000:.2f}ms")
        
        # Phase 2: Discoloration detection (CV + AI)
        detection_start = time.time()
        cv_damage = detect_discoloration_cv(enhanced_image_bytes)
        ai_damage = detect_discoloration(enhanced_image_bytes, ai_client)
        damage_areas = merge_damage_areas(cv_damage, ai_damage, iou_threshold=0.35)
        damage_areas = annotate_damage_with_ai(
            image_bytes,
            damage_areas,
            ai_client,
            task="discoloration, algae, moisture staining"
        )
        print(f"Discoloration detection (cv+ai) took {(time.time() - detection_start) * 1000:.2f}ms")
        
        # Add grid coordinates to damage areas
        for area in damage_areas:
            bbox = area.get('bbox', [])
            if len(bbox) == 4:
                grid_coords = bbox_to_grid_coords(bbox, image_width, image_height)
                area['grid_coords'] = grid_coords
            # Ensure severity is set
            if 'severity' not in area:
                severity_score = area.get('discoloration_severity', 0.5)
                if severity_score < 0.33:
                    area['severity'] = 'minor'
                elif severity_score < 0.67:
                    area['severity'] = 'moderate'
                else:
                    area['severity'] = 'severe'
        
        # Calculate overall discoloration severity
        overall_severity = 0.0
        if damage_areas:
            overall_severity = sum(area.get('discoloration_severity', 0.0) for area in damage_areas) / len(damage_areas)
        
        # Prepare full results for persistence
        full_agent2_results = {
            'enhanced_image_base64': enhanced_image_base64,
            'damage_areas': damage_areas,
            'discoloration_severity': overall_severity
        }
        agent2_summary = {
            'damage_area_count': len(damage_areas),
            'average_discoloration_severity': overall_severity,
            'enhanced_image_stored': True
        }
        
        # Update metadata in DynamoDB
        print(f"[Agent2] Persisting {len(damage_areas)} discoloration areas for {photo_id}")
        metadata = get_metadata(table_name, photo_id, region)
        if metadata:
            metadata.agent2_results = full_agent2_results
            put_metadata(table_name, metadata, region)
        else:
            # Create new metadata if not found
            metadata = PhotoMetadata(
                photo_id=photo_id,
                timestamp=time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                s3_key=s3_key,
                status='processing',
                agent2_results=full_agent2_results
            )
            put_metadata(table_name, metadata, region)
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        print(f"[Agent2] Completed photo {photo_id} in {processing_time_ms}ms")
        
        return {
            'photo_id': photo_id,
            'agent2_results': agent2_summary,
            'processing_time_ms': processing_time_ms
        }
        
    except Exception as e:
        print(f"Error in Agent 2 handler: {e}")
        import traceback
        traceback.print_exc()
        raise

