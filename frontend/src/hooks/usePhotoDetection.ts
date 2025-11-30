import { useState, useCallback } from 'react';
import { getUploadUrl, uploadPhotoToS3, uploadPhotoViaApi, triggerDetection, getPhotoMetadata } from '../services/api';
import type { PhotoMetadata, UploadResponse } from '../types/detection';
import { extractErrorMessage } from '../utils/errorUtils';

interface UsePhotoDetectionReturn {
  uploading: boolean;
  analyzing: boolean;
  metadata: PhotoMetadata | null;
  error: string | null;
  uploadPhoto: (file: File, userId?: string) => Promise<void>;
  analyzePhoto: (photoId: string, s3Key?: string) => Promise<void>;
  reset: () => void;
}

export function usePhotoDetection(): UsePhotoDetectionReturn {
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [metadata, setMetadata] = useState<PhotoMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(
    async (photoId: string, s3Key?: string) => {
      setError(null);
      setAnalyzing(true);
      try {
        await triggerDetection(photoId, s3Key);
        const latest = await getPhotoMetadata(photoId);
        setMetadata(latest);
      } catch (err) {
        const errorMessage = extractErrorMessage(err);
        setError(errorMessage);
        throw err;
      } finally {
        setAnalyzing(false);
      }
    },
    []
  );

  const uploadPhoto = useCallback(
    async (file: File, userId?: string) => {
      setError(null);
      setUploading(true);
      try {
        const uploadData: UploadResponse = await getUploadUrl(userId);
        let finalPhotoId = uploadData.photo_id;
        let finalS3Key = uploadData.s3_key;

        try {
          await uploadPhotoToS3(uploadData.upload_url, file);
        } catch (err) {
          const errMsg = extractErrorMessage(err);
          console.warn('Direct S3 upload failed, falling back to API upload:', errMsg);
          const apiUploadResult = await uploadPhotoViaApi(userId, file);
          finalPhotoId = apiUploadResult.photo_id;
          finalS3Key = apiUploadResult.s3_key;
        }

        await runAnalysis(finalPhotoId, finalS3Key);
      } catch (err) {
        const errorMessage = extractErrorMessage(err);
        setError(errorMessage);
      } finally {
        setUploading(false);
      }
    },
    [runAnalysis]
  );

  const analyzePhoto = useCallback(
    async (photoId: string, s3Key?: string) => {
      if (!photoId) {
        return;
      }
      try {
        await runAnalysis(photoId, s3Key);
      } catch {
        // error already captured in runAnalysis
      }
    },
    [runAnalysis]
  );

  const reset = useCallback(() => {
    setMetadata(null);
    setError(null);
    setUploading(false);
    setAnalyzing(false);
  }, []);

  return {
    uploading,
    analyzing,
    metadata,
    error,
    uploadPhoto,
    analyzePhoto,
    reset,
  };
}