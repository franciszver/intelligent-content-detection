/**
 * API service for backend communication
 */
import axios from 'axios';
import type { UploadResponse, DetectionResponse, PhotoMetadata } from '../types/detection';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

if (!API_BASE_URL) {
  console.warn('VITE_API_BASE_URL not set, API calls will fail');
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Get presigned URL for photo upload
 */
export async function getUploadUrl(userId?: string): Promise<UploadResponse> {
  const response = await api.post<UploadResponse>('/photos/upload', {
    user_id: userId,
    content_type: 'image/jpeg',
  });
  return response.data;
}

/**
 * Upload photo directly to S3 using presigned URL
 */
export async function uploadPhotoToS3(
  presignedUrl: string,
  file: File
): Promise<void> {
  await axios.put(presignedUrl, file, {
    headers: {
      'Content-Type': file.type,
    },
  });
}

/**
 * Trigger content detection for a photo
 */
export async function triggerDetection(
  photoId: string,
  s3Key?: string
): Promise<DetectionResponse> {
  const response = await api.post<DetectionResponse>(
    `/photos/${photoId}/detect`,
    {
      photo_id: photoId,
      s3_key: s3Key,
    }
  );
  return response.data;
}

/**
 * Get photo metadata
 */
export async function getPhotoMetadata(photoId: string): Promise<PhotoMetadata> {
  const response = await api.get<PhotoMetadata>(
    `/photos/${photoId}/metadata`
  );
  return response.data;
}

/**
 * Poll for detection results
 */
export async function pollDetectionResults(
  photoId: string,
  maxAttempts: number = 30,
  intervalMs: number = 2000
): Promise<PhotoMetadata> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const metadata = await getPhotoMetadata(photoId);
    
    if (metadata.status === 'completed') {
      return metadata;
    }
    
    if (metadata.status === 'failed') {
      throw new Error('Detection failed');
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error('Detection timeout');
}

