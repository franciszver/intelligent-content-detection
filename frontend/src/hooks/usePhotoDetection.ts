/**
 * React hook for photo detection workflow
 */
import { useState, useCallback } from 'react';
import { getUploadUrl, uploadPhotoToS3, triggerDetection, pollDetectionResults } from '../services/api';
import type { PhotoMetadata, UploadResponse } from '../types/detection';

interface UsePhotoDetectionReturn {
  uploading: boolean;
  detecting: boolean;
  metadata: PhotoMetadata | null;
  error: string | null;
  uploadPhoto: (file: File, userId?: string) => Promise<void>;
  reset: () => void;
}

export function usePhotoDetection(): UsePhotoDetectionReturn {
  const [uploading, setUploading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [metadata, setMetadata] = useState<PhotoMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadPhoto = useCallback(async (file: File, userId?: string) => {
    try {
      setError(null);
      setUploading(true);

      // Step 1: Get presigned URL
      const uploadData: UploadResponse = await getUploadUrl(userId);

      // Step 2: Upload to S3
      await uploadPhotoToS3(uploadData.upload_url, file);

      // Step 3: Trigger detection
      setUploading(false);
      setDetecting(true);

      // Detection will be triggered automatically by S3 event,
      // but we can also trigger it manually
      await triggerDetection(uploadData.photo_id, uploadData.s3_key);

      // Step 4: Poll for results
      const result = await pollDetectionResults(uploadData.photo_id);
      setMetadata(result);
      setDetecting(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setUploading(false);
      setDetecting(false);
    }
  }, []);

  const reset = useCallback(() => {
    setMetadata(null);
    setError(null);
    setUploading(false);
    setDetecting(false);
  }, []);

  return {
    uploading,
    detecting,
    metadata,
    error,
    uploadPhoto,
    reset,
  };
}

