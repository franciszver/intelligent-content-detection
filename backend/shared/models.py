"""
Data models for the application
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    """Bounding box coordinates"""
    x1: int = Field(..., description="Top-left x coordinate")
    y1: int = Field(..., description="Top-left y coordinate")
    x2: int = Field(..., description="Bottom-right x coordinate")
    y2: int = Field(..., description="Bottom-right y coordinate")


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

    def to_dynamodb_item(self) -> Dict[str, Any]:
        """Convert to DynamoDB item format"""
        item = {
            'photo_id': self.photo_id,
            'timestamp': self.timestamp,
            's3_key': self.s3_key,
            'status': self.status,
            'detections': self.detections,
            'materials': self.materials,
        }
        if self.user_id:
            item['user_id'] = self.user_id
        if self.processing_time_ms:
            item['processing_time_ms'] = self.processing_time_ms
        if self.ai_provider:
            item['ai_provider'] = self.ai_provider
        if self.expires_at:
            item['expires_at'] = self.expires_at
        return item

    @classmethod
    def from_dynamodb_item(cls, item: Dict[str, Any]) -> 'PhotoMetadata':
        """Create from DynamoDB item"""
        return cls(**item)

