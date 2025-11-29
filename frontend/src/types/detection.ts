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
  // Multi-agent workflow fields
  workflow_status?: 'pending' | 'processing' | 'completed' | 'failed';
  agent1_results?: {
    wireframe_base64?: string;
    zones?: Array<{
      zone_type: string;
      bbox: number[];
      confidence?: number;
    }>;
    damage_areas?: Array<{
      bbox: number[];
      grid_coords?: { row: number; col: number };
      confidence: number;
      damage_type?: string;
      severity?: string;
    }>;
  };
  agent2_results?: {
    enhanced_image_base64?: string;
    damage_areas?: Array<{
      bbox: number[];
      grid_coords?: { row: number; col: number };
      confidence: number;
      damage_type?: string;
      severity?: string;
      discoloration_severity?: number;
    }>;
    discoloration_severity?: number;
  };
  agent3_results?: {
    overlay_s3_key?: string;
    report_s3_key?: string;
    overlap_areas?: Array<{
      bbox: number[];
      grid_coords?: { row: number; col: number };
      confidence: number;
      damage_type?: string;
      severity?: string;
      agent1_confidence?: number;
      agent2_confidence?: number;
      overlap_score?: number;
    }>;
    damage_counts?: Record<string, number>;
    damage_summary?: {
      total_damage_areas: number;
      high_confidence_areas: number;
      recommended_action: string;
    };
  };
  overlay_s3_key?: string;
  report_s3_key?: string;
  overlay_url?: string;
  report_url?: string;
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

