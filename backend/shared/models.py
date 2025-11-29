"""
Data models for the application
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    """Bounding box coordinates"""
    x1: int = Field(..., description="Top-left x coordinate")
    y1: int = Field(..., description="Top-left y coordinate")
    x2: int = Field(..., description="Bottom-right x coordinate")
    y2: int = Field(..., description="Bottom-right y coordinate")


class RoofZone(BaseModel):
    """Roof zone segmentation result"""
    zone_type: str = Field(..., description="Zone type: shingles, vents, skylights, gutters, edges")
    bbox: List[int] = Field(..., description="Bounding box [x1, y1, x2, y2]")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")


class DamageArea(BaseModel):
    """Damage area detection result"""
    bbox: List[int] = Field(..., description="Bounding box [x1, y1, x2, y2]")
    grid_coords: Optional[Dict[str, int]] = Field(None, description="Grid coordinates {row, col}")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    damage_type: Optional[str] = Field(None, description="Damage type: missing_shingles, cracks, hail_impact, water_stains, sagging, discoloration")
    severity: Optional[str] = Field(None, description="Severity: minor, moderate, severe")
    discoloration_severity: Optional[float] = Field(None, ge=0.0, le=1.0, description="Discoloration severity (0.0-1.0)")
    source: Optional[str] = Field(None, description="Origin of detection (cv, ai, merged)")
    ai_provider: Optional[str] = Field(None, description="AI provider used for annotation")
    zone_id: Optional[str] = Field(None, description="Associated roof zone id")
    notes: Optional[str] = Field(None, description="Additional inspector notes")


class WireframeAnalysis(BaseModel):
    """Wireframe analysis results"""
    wireframe_base64: str = Field(..., description="Base64 encoded wireframe image")
    zones: List[Dict[str, Any]] = Field(default_factory=list, description="Roof zones")
    damage_areas: List[Dict[str, Any]] = Field(default_factory=list, description="Detected damage areas")


class ColorAnalysis(BaseModel):
    """Color enhancement analysis results"""
    enhanced_image_base64: str = Field(..., description="Base64 encoded enhanced image")
    damage_areas: List[Dict[str, Any]] = Field(default_factory=list, description="Detected damage areas")
    discoloration_severity: Optional[float] = Field(None, ge=0.0, le=1.0, description="Overall discoloration severity")


class OverlayAnalysis(BaseModel):
    """Overlay analysis results"""
    overlap_areas: List[Dict[str, Any]] = Field(default_factory=list, description="Overlapping damage areas with merged confidences")
    damage_counts: Dict[str, int] = Field(default_factory=dict, description="Damage counts by type")
    overlay_s3_key: Optional[str] = Field(None, description="S3 key for overlay image")
    report_s3_key: Optional[str] = Field(None, description="S3 key for damage report")
    damage_summary: Optional[Dict[str, Any]] = Field(None, description="Summary statistics")


class Detection(BaseModel):
    """Detection result for roof damage"""
    type: str = Field(..., description="Detection type (e.g., 'roof_damage')")
    category: str = Field(..., description="Damage category (hail, wind, missing_shingles)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    bbox: Optional[List[int]] = Field(None, description="Bounding box [x1, y1, x2, y2]")
    severity: Optional[str] = Field(None, description="Severity level (minor, moderate, severe)")


class Material(BaseModel):
    """Material detection result"""
    type: str = Field(..., description="Material type (e.g., 'shingles', 'plywood')")
    count: int = Field(..., ge=0, description="Count of items")
    unit: Optional[str] = Field(None, description="Unit (bundles, sheets, etc.)")
    brand: Optional[str] = Field(None, description="Brand name if visible")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")


class PhotoMetadata(BaseModel):
    """Photo metadata stored in DynamoDB"""
    photo_id: str
    timestamp: str
    s3_key: str
    user_id: Optional[str] = None
    status: str = Field(default="pending", description="pending, processing, completed, failed")
    detections: List[Dict[str, Any]] = Field(default_factory=list)
    materials: List[Dict[str, Any]] = Field(default_factory=list)
    processing_time_ms: Optional[int] = None
    ai_provider: Optional[str] = None
    expires_at: Optional[int] = None
    # Multi-agent workflow fields
    workflow_status: Optional[str] = Field(None, description="pending, processing, completed, failed")
    agent1_results: Optional[Dict[str, Any]] = Field(None, description="Wireframe analysis results")
    agent2_results: Optional[Dict[str, Any]] = Field(None, description="Color analysis results")
    agent3_results: Optional[Dict[str, Any]] = Field(None, description="Overlay analysis results")
    overlay_s3_key: Optional[str] = Field(None, description="S3 key for overlay image")
    report_s3_key: Optional[str] = Field(None, description="S3 key for damage report")

    def to_dynamodb_item(self) -> Dict[str, Any]:
        """Convert to DynamoDB item format, converting floats to Decimals"""
        def convert_floats(obj):
            """Recursively convert floats to Decimals for DynamoDB"""
            if isinstance(obj, float):
                return Decimal(str(obj))
            elif isinstance(obj, dict):
                return {k: convert_floats(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_floats(item) for item in obj]
            return obj
        
        item = {
            'photo_id': self.photo_id,
            'timestamp': self.timestamp,
            's3_key': self.s3_key,
            'status': self.status,
            'detections': convert_floats(self.detections),
            'materials': convert_floats(self.materials),
        }
        if self.user_id:
            item['user_id'] = self.user_id
        if self.processing_time_ms:
            item['processing_time_ms'] = self.processing_time_ms
        if self.ai_provider:
            item['ai_provider'] = self.ai_provider
        if self.expires_at:
            item['expires_at'] = self.expires_at
        if self.workflow_status:
            item['workflow_status'] = self.workflow_status
        if self.agent1_results:
            item['agent1_results'] = convert_floats(self.agent1_results)
        if self.agent2_results:
            item['agent2_results'] = convert_floats(self.agent2_results)
        if self.agent3_results:
            item['agent3_results'] = convert_floats(self.agent3_results)
        if self.overlay_s3_key:
            item['overlay_s3_key'] = self.overlay_s3_key
        if self.report_s3_key:
            item['report_s3_key'] = self.report_s3_key
        return item

    @classmethod
    def from_dynamodb_item(cls, item: Dict[str, Any]) -> 'PhotoMetadata':
        """Create from DynamoDB item, converting Decimals to floats"""
        def convert_decimals(obj: Any) -> Any:
            """Recursively convert Decimal types to float/int"""
            from decimal import Decimal
            if isinstance(obj, Decimal):
                # Convert Decimal to float (or int if it's a whole number)
                if obj % 1 == 0:
                    return int(obj)
                return float(obj)
            elif isinstance(obj, dict):
                return {key: convert_decimals(value) for key, value in obj.items()}
            elif isinstance(obj, list):
                return [convert_decimals(item) for item in obj]
            return obj
        
        # Convert all Decimals in the item before creating the model
        converted_item = convert_decimals(item)
        return cls(**converted_item)

