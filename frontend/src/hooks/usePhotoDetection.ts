import { useState, useCallback, useRef } from 'react';
import { getUploadUrl, uploadPhotoToS3, uploadPhotoViaApi, triggerDetection, getPhotoMetadata } from '../services/api';
import type { PhotoMetadata, UploadResponse } from '../types/detection';
import { extractErrorMessage } from '../utils/errorUtils';

interface UsePhotoDetectionReturn {
  uploading: boolean;
  analyzing: boolean;
  backgroundAnalysisComplete: boolean;
  metadata: PhotoMetadata | null;
  error: string | null;
  uploadError: string | null; // Separate error for upload failures (show immediately)
  photoId: string | null;
  s3Key: string | null;
  uploadAndStartAnalysis: (file: File, userId?: string) => Promise<boolean>; // Returns true if upload succeeded
  confirmAnalysis: () => Promise<void>;
  cancelAndReset: () => void;
  reset: () => void;
}

export function usePhotoDetection(): UsePhotoDetectionReturn {
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [backgroundAnalysisComplete, setBackgroundAnalysisComplete] = useState(false);
  const [metadata, setMetadata] = useState<PhotoMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [s3Key, setS3Key] = useState<string | null>(null);

  // AbortController to cancel polling
  const abortControllerRef = useRef<AbortController | null>(null);
  // Store background results until user confirms
  const backgroundResultRef = useRef<PhotoMetadata | null>(null);
  const backgroundErrorRef = useRef<string | null>(null);

  const runBackgroundAnalysis = useCallback(
    async (id: string, key?: string) => {
      // Create new abort controller for this analysis
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        await triggerDetection(id, key);

        // Poll for metadata until status is 'completed' or 'failed'
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts * 3 seconds = 90 seconds max
        const pollInterval = 3000;
        let latest = await getPhotoMetadata(id);

        while ((latest.status === 'processing' || latest.status === 'pending') && attempts < maxAttempts) {
          // Check if cancelled
          if (signal.aborted) {
            return;
          }

          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, pollInterval);
            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Cancelled'));
            }, { once: true });
          });

          if (signal.aborted) {
            return;
          }

          latest = await getPhotoMetadata(id);
          attempts++;
        }

        // Store results for when user confirms
        if (!signal.aborted) {
          backgroundResultRef.current = latest;
          setBackgroundAnalysisComplete(true);
        }
      } catch (err) {
        if (!signal.aborted) {
          const errorMessage = extractErrorMessage(err);
          backgroundErrorRef.current = errorMessage;
          setBackgroundAnalysisComplete(true);
        }
      }
    },
    []
  );

  const uploadAndStartAnalysis = useCallback(
    async (file: File, userId?: string): Promise<boolean> => {
      setError(null);
      setUploadError(null);
      setUploading(true);
      setBackgroundAnalysisComplete(false);
      backgroundResultRef.current = null;
      backgroundErrorRef.current = null;

      try {
        // Pass actual file type to ensure presigned URL signature matches
        const uploadData: UploadResponse = await getUploadUrl(userId, file.type || 'image/jpeg');
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

        // Store photo info
        setPhotoId(finalPhotoId);
        setS3Key(finalS3Key);

        // Start background analysis (don't await - let it run in background)
        runBackgroundAnalysis(finalPhotoId, finalS3Key);

        setUploading(false);
        return true; // Upload succeeded

      } catch (err) {
        const errorMessage = extractErrorMessage(err);
        setUploadError(errorMessage); // Use uploadError for upload failures
        setUploading(false);
        return false; // Upload failed
      }
    },
    [runBackgroundAnalysis]
  );

  const confirmAnalysis = useCallback(
    async () => {
      // User clicked "Yes, Analyze" - show results or continue waiting
      setAnalyzing(true);

      // Check if results are already ready (refs are always current, unlike state)
      if (backgroundResultRef.current) {
        setMetadata(backgroundResultRef.current);
        setAnalyzing(false);
        return;
      }
      if (backgroundErrorRef.current) {
        setError(backgroundErrorRef.current);
        setAnalyzing(false);
        return;
      }

      // Otherwise, wait for background analysis to complete
      // Poll the refs until done (refs are always current)
      const checkInterval = 200; // Check every 200ms
      const maxWait = 90000; // 90 seconds max
      let waited = 0;

      while (waited < maxWait) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waited += checkInterval;

        // Check if results are ready (use refs, not state)
        if (backgroundResultRef.current || backgroundErrorRef.current) {
          break;
        }
      }

      // Show results or error
      if (backgroundErrorRef.current) {
        setError(backgroundErrorRef.current);
      } else if (backgroundResultRef.current) {
        setMetadata(backgroundResultRef.current);
      } else {
        setError('Analysis timed out. Please try again.');
      }

      setAnalyzing(false);
    },
    [] // No dependencies needed - we use refs which are always current
  );

  const cancelAndReset = useCallback(() => {
    // Cancel any in-flight analysis
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear all state
    setMetadata(null);
    setError(null);
    setUploadError(null);
    setUploading(false);
    setAnalyzing(false);
    setBackgroundAnalysisComplete(false);
    setPhotoId(null);
    setS3Key(null);
    backgroundResultRef.current = null;
    backgroundErrorRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancelAndReset();
  }, [cancelAndReset]);

  return {
    uploading,
    analyzing,
    backgroundAnalysisComplete,
    metadata,
    error,
    uploadError,
    photoId,
    s3Key,
    uploadAndStartAnalysis,
    confirmAnalysis,
    cancelAndReset,
    reset,
  };
}
