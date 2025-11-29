"""
Lambda handler for Agent 3 - Overlap analysis and overlay generation
"""
import json
import os
import time
import io
from typing import Dict, Any, List
import sys

# Ensure handler can see local modules and Lambda layer packages (cv2, numpy)
current_dir = os.path.dirname(__file__)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

LAYER_SITE = '/opt/python/lib/python3.11/site-packages'
if os.path.isdir('/opt/python') and '/opt/python' not in sys.path:
    sys.path.append('/opt/python')
if os.path.isdir(LAYER_SITE) and LAYER_SITE not in sys.path:
    sys.path.append(LAYER_SITE)

from shared.s3 import download_image, upload_file_to_s3
from shared.dynamodb import get_metadata, put_metadata
from shared.models import PhotoMetadata
from shared.cv_utils import (
    calculate_overlap,
    count_damage_instances,
    generate_overlay,
    filter_large_damage_areas
)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for overlay generation
    
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
        
        print(f"[Agent3] Starting overlay generation for event: {event}")
        # Get photo info from event
        photo_id = event.get('photo_id')
        s3_key = event.get('s3_key')
        
        if not photo_id or not s3_key:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing photo_id or s3_key'})
            }
        
        # Retrieve Agent 1 and Agent 2 results from DynamoDB
        metadata = get_metadata(table_name, photo_id, region)
        if not metadata:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': 'Photo metadata not found'})
            }
        
        agent1_results = metadata.agent1_results or {}
        agent2_results = metadata.agent2_results or {}
        
        agent1_damage_areas = agent1_results.get('damage_areas', [])
        agent2_damage_areas = agent2_results.get('damage_areas', [])
        
        print(f"[Agent3] Downloading original image {s3_key} for {photo_id}")
        original_image_bytes = download_image(bucket_name, s3_key, region)
        if not original_image_bytes:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': 'Original image not found in S3'})
            }
        from PIL import Image
        img = Image.open(io.BytesIO(original_image_bytes))
        image_width, image_height = img.size
        
        agent1_damage_areas = filter_large_damage_areas(agent1_damage_areas, image_width, image_height)
        agent2_damage_areas = filter_large_damage_areas(agent2_damage_areas, image_width, image_height)
        
        # Phase 1: Calculate overlaps
        overlap_areas = []
        overlap_threshold = 0.3
        
        for area1 in agent1_damage_areas:
            bbox1 = area1.get('bbox', [])
            if len(bbox1) != 4:
                continue
            
            best_overlap = None
            best_iou = 0.0
            
            for area2 in agent2_damage_areas:
                bbox2 = area2.get('bbox', [])
                if len(bbox2) != 4:
                    continue
                
                iou = calculate_overlap(bbox1, bbox2)
                if iou > best_iou and iou > overlap_threshold:
                    best_iou = iou
                    best_overlap = area2
            
            if best_overlap:
                # Merge overlapping areas
                conf1 = area1.get('confidence', 0.5)
                conf2 = best_overlap.get('confidence', 0.5)
                merged_confidence = (conf1 * 0.5) + (conf2 * 0.5)
                
                # Prioritize damage type from higher confidence agent
                if conf1 >= conf2:
                    damage_type = area1.get('damage_type', best_overlap.get('damage_type', 'unknown'))
                    severity = area1.get('severity', best_overlap.get('severity', 'moderate'))
                else:
                    damage_type = best_overlap.get('damage_type', area1.get('damage_type', 'unknown'))
                    severity = best_overlap.get('severity', area1.get('severity', 'moderate'))
                
                overlap_area = {
                    'bbox': bbox1,  # Use Agent 1 bbox
                    'grid_coords': area1.get('grid_coords', {}),
                    'confidence': merged_confidence,
                    'damage_type': damage_type,
                    'severity': severity,
                    'agent1_confidence': conf1,
                    'agent2_confidence': conf2,
                    'overlap_score': best_iou
                }
                overlap_areas.append(overlap_area)
            else:
                # No overlap, but include Agent 1 area with lower confidence
                overlap_area = {
                    **area1,
                    'agent1_confidence': area1.get('confidence', 0.5),
                    'agent2_confidence': 0.0,
                    'overlap_score': 0.0
                }
                overlap_areas.append(overlap_area)
        
        # Add Agent 2 areas that don't overlap with Agent 1
        for area2 in agent2_damage_areas:
            bbox2 = area2.get('bbox', [])
            if len(bbox2) != 4:
                continue
            
            has_overlap = False
            for area1 in agent1_damage_areas:
                bbox1 = area1.get('bbox', [])
                if len(bbox1) != 4:
                    continue
                if calculate_overlap(bbox1, bbox2) > overlap_threshold:
                    has_overlap = True
                    break
            
            if not has_overlap:
                overlap_area = {
                    **area2,
                    'agent1_confidence': 0.0,
                    'agent2_confidence': area2.get('confidence', 0.5),
                    'overlap_score': 0.0
                }
                overlap_areas.append(overlap_area)
        
        # Phase 2: Count damage instances
        damage_counts = count_damage_instances(overlap_areas)
        
        # Phase 3: Generate overlay
        overlap_areas = filter_large_damage_areas(overlap_areas, image_width, image_height)
        
        confidences = [area.get('confidence', 0.5) for area in overlap_areas]
        damage_types = [area.get('damage_type', 'unknown') for area in overlap_areas]
        
        overlay_bytes = generate_overlay(
            original_image_bytes,
            overlap_areas,
            confidences=confidences,
            damage_types=damage_types,
            counts=damage_counts
        )
        
        # Upload overlay to S3
        overlay_s3_key = f"overlays/{photo_id}/overlay.png"
        upload_success = upload_file_to_s3(
            bucket_name=bucket_name,
            object_key=overlay_s3_key,
            file_data=overlay_bytes,
            content_type='image/png',
            region=region
        )
        
        if not upload_success:
            return {
                'statusCode': 500,
                'body': json.dumps({'error': 'Failed to upload overlay to S3'})
            }
        print(f"[Agent3] Uploaded overlay to {overlay_s3_key}")
        
        # Phase 4: Generate damage report
        total_areas = len(overlap_areas)
        high_confidence_areas = sum(1 for area in overlap_areas if area.get('confidence', 0) > 0.7)
        
        damage_summary = {
            'total_damage_areas': total_areas,
            'high_confidence_areas': high_confidence_areas,
            'recommended_action': 'repair' if total_areas > 0 else 'none'
        }
        
        report_data = {
            'photo_id': photo_id,
            'timestamp': metadata.timestamp,
            'damage_counts': damage_counts,
            'damage_summary': damage_summary,
            'overlap_areas': overlap_areas
        }
        
        # Upload report to S3
        report_json = json.dumps(report_data, indent=2)
        report_s3_key = f"reports/{photo_id}/damage_report.json"
        upload_success = upload_file_to_s3(
            bucket_name=bucket_name,
            object_key=report_s3_key,
            file_data=report_json.encode('utf-8'),
            content_type='application/json',
            region=region
        )
        print(f"[Agent3] Uploaded report to {report_s3_key}")
        
        # Prepare results
        agent3_results = {
            'overlay_s3_key': overlay_s3_key,
            'report_s3_key': report_s3_key if upload_success else None,
            'overlap_areas': overlap_areas,
            'damage_counts': damage_counts,
            'damage_summary': damage_summary
        }
        
        # Update metadata
        metadata.agent3_results = agent3_results
        metadata.overlay_s3_key = overlay_s3_key
        metadata.report_s3_key = report_s3_key if upload_success else None
        metadata.workflow_status = 'completed'
        metadata.status = 'completed'
        put_metadata(table_name, metadata, region)
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        print(f"[Agent3] Completed overlay for {photo_id} in {processing_time_ms}ms")
        
        return {
            'photo_id': photo_id,
            'agent3_results': agent3_results,
            'processing_time_ms': processing_time_ms
        }
        
    except Exception as e:
        print(f"Error in Agent 3 handler: {e}")
        import traceback
        traceback.print_exc()
        
        # Update metadata with failed status
        try:
            if photo_id:
                metadata = get_metadata(table_name, photo_id, region)
                if metadata:
                    metadata.workflow_status = 'failed'
                    metadata.status = 'failed'
                    put_metadata(table_name, metadata, region)
        except Exception as update_error:
            print(f"Failed to update metadata after Agent 3 error: {update_error}")
        
        raise

