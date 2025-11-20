/**
 * Type definitions for detection results
 */
export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Detection {
  type: string;
  category: string;
  confidence: number;
  bbox?: number[];
  severity?: string;
}

export interface Material {
  type: string;
  count: number;
  unit?: string;
  brand?: string;
  confidence: number;
}

export interface PhotoMetadata {
  photo_id: string;
  timestamp: string;
  s3_key: string;
  user_id?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  detections: Detection[];
  materials: Material[];
  processing_time_ms?: number;
  ai_provider?: string;
}

export interface UploadResponse {
  photo_id: string;
  upload_url: string;
  s3_key: string;
  expires_in: number;
}

export interface DetectionResponse {
  photo_id: string;
  status: string;
  detections: Detection[];
  materials: Material[];
  processing_time_ms?: number;
  ai_provider?: string;
}

