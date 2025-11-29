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
  try {
    await axios.put(presignedUrl, file, {
      headers: {
        'Content-Type': file.type,
      },
    });
  } catch (error: any) {
    // If CORS error or network error, throw a specific error to trigger fallback
    const errorMessage = error?.message || '';
    const errorCode = error?.code || '';
    const isCorsError = 
      errorMessage.includes('CORS') ||
      errorMessage.includes('cors') ||
      errorCode === 'ERR_FAILED' ||
      errorCode === 'ERR_NETWORK' ||
      (error?.response?.status === 0 && !error?.response?.data);
    
    if (isCorsError) {
      console.log('CORS error detected, will use fallback:', { errorMessage, errorCode });
      throw new Error('CORS_ERROR');
    }
    throw error;
  }
}

/**
 * Upload photo via API using base64 encoding (fallback for CORS issues)
 */
export async function uploadPhotoViaApi(
  userId: string | undefined,
  file: File
): Promise<{ photo_id: string; s3_key: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1]; // Remove data:image/jpeg;base64, prefix
        const response = await api.post<{ photo_id: string; s3_key: string }>('/photos/upload', {
          user_id: userId,
          file: base64,
          content_type: file.type,
        });
        resolve(response.data);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
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

/**
 * Trigger multi-agent analysis for a photo
 */
export async function analyzePhoto(
  photoId: string,
  s3Key?: string
): Promise<{ photo_id: string; execution_arn: string; workflow_status: string }> {
  const response = await api.post<{ photo_id: string; execution_arn: string; workflow_status: string }>(
    `/photos/${photoId}/analyze`,
    {
      photo_id: photoId,
      s3_key: s3Key,
    }
  );
  return response.data;
}

/**
 * Poll for workflow results (multi-agent analysis)
 */
export async function pollWorkflowResults(
  photoId: string,
  maxAttempts: number = 60,
  intervalMs: number = 2000
): Promise<PhotoMetadata> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const metadata = await getPhotoMetadata(photoId);
    
    const workflowStatus = metadata.workflow_status || metadata.status;
    
    if (workflowStatus === 'completed') {
      return metadata;
    }
    
    if (workflowStatus === 'failed') {
      throw new Error('Workflow failed');
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error('Workflow timeout');
}

