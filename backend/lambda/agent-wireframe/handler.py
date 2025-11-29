"""
Lambda handler for Agent 1 - Wireframe generation and structural analysis
"""
import os
import base64
import time
from typing import Dict, Any
import sys
import json

# Ensure local and layer site-packages are on import path
current_dir = os.path.dirname(__file__)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# Add Lambda layer paths so cv2/numpy from the layer are discoverable
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
    segment_roof_zones,
    generate_wireframe,
    detect_disjointed_lines,
    classify_damage_types
)
from ai_client import AIClient


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for wireframe analysis
    
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
        
        print(f"[Agent1] Starting wireframe analysis for event: {event}")
        # Get photo info from event
        photo_id = event.get('photo_id')
        s3_key = event.get('s3_key')
        
        if not photo_id or not s3_key:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing photo_id or s3_key'})
            }
        
        print(f"[Agent1] Downloading image {s3_key} for photo {photo_id}")
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
        
        # Phase 1: Zone segmentation
        zones_start = time.time()
        zones = segment_roof_zones(image_bytes, ai_client)
        print(f"Zone segmentation took {(time.time() - zones_start) * 1000:.2f}ms")
        
        # Phase 2: Generate wireframe
        wireframe_start = time.time()
        wireframe_bytes = generate_wireframe(image_bytes, zones)
        wireframe_base64 = base64.b64encode(wireframe_bytes).decode('utf-8')
        print(f"Wireframe generation took {(time.time() - wireframe_start) * 1000:.2f}ms")
        
        # Phase 3: Detect disjointed lines
        detection_start = time.time()
        damage_areas = detect_disjointed_lines(wireframe_bytes)
        print(f"Disjointed line detection took {(time.time() - detection_start) * 1000:.2f}ms")
        
        # Phase 4: Classify damage types
        if damage_areas:
            classification_start = time.time()
            damage_areas = classify_damage_types(image_bytes, damage_areas, ai_client)
            print(f"Damage classification took {(time.time() - classification_start) * 1000:.2f}ms")

        print(f"[Agent1] Detected {len(damage_areas)} structural issues for {photo_id}")
        
        # Add grid coordinates to damage areas
        for area in damage_areas:
            bbox = area.get('bbox', [])
            if len(bbox) == 4:
                grid_coords = bbox_to_grid_coords(bbox, image_width, image_height)
                area['grid_coords'] = grid_coords
        
        # Prepare full results (persisted in DynamoDB)
        full_agent1_results = {
            'wireframe_base64': wireframe_base64,
            'zones': zones,
            'damage_areas': damage_areas
        }
        summary_damage_count = len(damage_areas)
        summary_zone_count = len(zones)
        max_confidence = 0.0
        if damage_areas:
            max_confidence = max(area.get('confidence', 0.0) for area in damage_areas)
        
        step_function_summary = {
            'damage_area_count': summary_damage_count,
            'zones_detected': summary_zone_count,
            'max_confidence': max_confidence,
            'wireframe_stored': True
        }
        
        # Update metadata in DynamoDB
        metadata = get_metadata(table_name, photo_id, region)
        if metadata:
            metadata.agent1_results = full_agent1_results
            put_metadata(table_name, metadata, region)
        else:
            # Create new metadata if not found
            metadata = PhotoMetadata(
                photo_id=photo_id,
                timestamp=time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                s3_key=s3_key,
                status='processing',
                agent1_results=full_agent1_results
            )
            put_metadata(table_name, metadata, region)
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        print(f"[Agent1] Completed photo {photo_id} in {processing_time_ms}ms")
        
        return {
            'photo_id': photo_id,
            'agent1_results': step_function_summary,
            'processing_time_ms': processing_time_ms
        }
        
    except Exception as e:
        print(f"Error in Agent 1 handler: {e}")
        import traceback
        traceback.print_exc()
        raise

