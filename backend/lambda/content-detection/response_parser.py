"""
Parser for AI response validation and structure
"""
import json
import os
import sys
from typing import Dict, Any, List, Optional

# Add Lambda root directory to path (where shared module is located)
sys.path.insert(0, os.path.dirname(__file__))

from shared.models import Detection, Material


class ResponseParser:
    """Parse and validate AI responses"""
    
    @staticmethod
    def parse_response(response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse AI response into structured format
        
        Args:
            response: Raw AI response dictionary
            
        Returns:
            Parsed response with detections and materials
        """
        parsed = {
            'detections': [],
            'materials': []
        }
        
        # Extract detections
        if 'detections' in response:
            for detection in response['detections']:
                try:
                    # Validate detection structure
                    if 'type' in detection and 'category' in detection:
                        parsed['detections'].append({
                            'type': detection.get('type', 'unknown'),
                            'category': detection.get('category', 'unknown'),
                            'confidence': float(detection.get('confidence', 0.0)),
                            'bbox': detection.get('bbox', []),
                            'severity': detection.get('severity', 'unknown')
                        })
                except (ValueError, KeyError) as e:
                    print(f"Error parsing detection: {e}")
                    continue
        
        # Extract materials
        if 'materials' in response:
            for material in response['materials']:
                try:
                    # Validate material structure
                    if 'type' in material and 'count' in material:
                        parsed['materials'].append({
                            'type': material.get('type', 'unknown'),
                            'count': int(material.get('count', 0)),
                            'unit': material.get('unit'),
                            'brand': material.get('brand'),
                            'confidence': float(material.get('confidence', 0.0))
                        })
                except (ValueError, KeyError) as e:
                    print(f"Error parsing material: {e}")
                    continue
        
        return parsed
    
    @staticmethod
    def validate_response(response: Dict[str, Any]) -> bool:
        """
        Validate response structure
        
        Args:
            response: Response dictionary
            
        Returns:
            True if valid, False otherwise
        """
        if not isinstance(response, dict):
            return False
        
        if 'detections' not in response and 'materials' not in response:
            return False
        
        # Check detections structure
        if 'detections' in response:
            if not isinstance(response['detections'], list):
                return False
            for detection in response['detections']:
                if not isinstance(detection, dict):
                    return False
                if 'type' not in detection or 'category' not in detection:
                    return False
        
        # Check materials structure
        if 'materials' in response:
            if not isinstance(response['materials'], list):
                return False
            for material in response['materials']:
                if not isinstance(material, dict):
                    return False
                if 'type' not in material or 'count' not in material:
                    return False
        
        return True

