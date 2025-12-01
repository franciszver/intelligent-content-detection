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
  source?: string;
  ai_provider?: string;
}

export interface DamageArea {
  bbox: number[];
  grid_coords?: { row: number; col: number };
  confidence: number;
  damage_type?: string;
  severity?: string;
  discoloration_severity?: number;
  source?: string;
  ai_provider?: string;
  zone_id?: string;
  notes?: string;
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
  single_agent_results?: SingleAgentResult;
  single_agent_overlay_s3_key?: string;
  single_agent_report_s3_key?: string;
  single_agent_overlay_url?: string;
  single_agent_report_url?: string;
}

export interface SingleAgentResult {
  model_version?: string;
  damage_areas?: DamageArea[];
  damage_counts?: Record<string, number>;
  ai_summary?: string;
  ai_recommendations?: string;
  ai_provider?: string;
  processing_time_ms?: number;
  gpt_response?: Record<string, unknown>;
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
  message?: string; // For async processing response (202 Accepted)
  detections?: Detection[];
  materials?: Material[];
  processing_time_ms?: number;
  ai_provider?: string;
  single_agent_results?: SingleAgentResult;
  single_agent_overlay_key?: string;
  single_agent_report_key?: string;
}

