import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePhotoDetection } from '../usePhotoDetection';
import * as api from '../../services/api';

vi.mock('../../services/api');

const baseUploadResponse = {
  photo_id: 'test-photo-id',
  s3_key: 'photos/test.jpg',
  upload_url: 'https://s3.amazonaws.com/bucket/test.jpg?signature=...',
};

const baseMetadata = {
  photo_id: 'test-photo-id',
  status: 'completed',
  s3_key: 'photos/test.jpg',
  detections: [],
  materials: [],
};

describe('usePhotoDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getUploadUrl).mockResolvedValue(baseUploadResponse as any);
    vi.mocked(api.uploadPhotoToS3).mockResolvedValue(undefined as any);
    vi.mocked(api.uploadPhotoViaApi).mockResolvedValue(baseUploadResponse as any);
    vi.mocked(api.triggerDetection).mockResolvedValue({ photo_id: 'test-photo-id', status: 'completed' } as any);
    vi.mocked(api.getPhotoMetadata).mockResolvedValue(baseMetadata as any);
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => usePhotoDetection());
    expect(result.current.uploading).toBe(false);
    expect(result.current.analyzing).toBe(false);
    expect(result.current.metadata).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('uploads photo and runs analysis', async () => {
    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
    const { result } = renderHook(() => usePhotoDetection());

    await result.current.uploadPhoto(file, 'user-123');

    await waitFor(() => {
      expect(result.current.uploading).toBe(false);
      expect(result.current.analyzing).toBe(false);
      expect(result.current.metadata).toEqual(baseMetadata);
    });

    expect(api.getUploadUrl).toHaveBeenCalledWith('user-123');
    expect(api.uploadPhotoToS3).toHaveBeenCalledWith(baseUploadResponse.upload_url, file);
    expect(api.triggerDetection).toHaveBeenCalledWith(baseUploadResponse.photo_id, baseUploadResponse.s3_key);
    expect(api.getPhotoMetadata).toHaveBeenCalledWith(baseUploadResponse.photo_id);
  });

  it('falls back to API upload on S3 failure', async () => {
    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
    const apiUpload = { photo_id: 'api-photo', s3_key: 'photos/api-photo.jpg' };

    vi.mocked(api.uploadPhotoToS3).mockRejectedValue(new Error('CORS'));
    vi.mocked(api.uploadPhotoViaApi).mockResolvedValue(apiUpload as any);

    const { result } = renderHook(() => usePhotoDetection());
    await result.current.uploadPhoto(file, 'user-123');

    await waitFor(() => {
      expect(result.current.uploading).toBe(false);
      expect(result.current.analyzing).toBe(false);
    });

    expect(api.uploadPhotoViaApi).toHaveBeenCalledWith('user-123', file);
    expect(api.triggerDetection).toHaveBeenCalledWith('api-photo', 'photos/api-photo.jpg');
  });

  it('captures upload errors', async () => {
    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
    vi.mocked(api.getUploadUrl).mockRejectedValue(new Error('Upload failed'));

    const { result } = renderHook(() => usePhotoDetection());
    await result.current.uploadPhoto(file);

    await waitFor(() => {
      expect(result.current.uploading).toBe(false);
      expect(result.current.error).toBe('Upload failed');
    });
  });

  it('captures analysis errors', async () => {
    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
    vi.mocked(api.triggerDetection).mockRejectedValue(new Error('Analysis failed'));

    const { result } = renderHook(() => usePhotoDetection());
    await result.current.uploadPhoto(file);

    await waitFor(() => {
      expect(result.current.uploading).toBe(false);
      expect(result.current.error).toBe('Analysis failed');
    });
  });

  it('manually re-runs analysis', async () => {
    const { result } = renderHook(() => usePhotoDetection());

    await result.current.analyzePhoto('manual-photo', 'photos/manual-photo.jpg');

    await waitFor(() => {
      expect(result.current.analyzing).toBe(false);
    });

    expect(api.triggerDetection).toHaveBeenCalledWith('manual-photo', 'photos/manual-photo.jpg');
    expect(api.getPhotoMetadata).toHaveBeenCalledWith('manual-photo');
  });

  it('resets state', async () => {
    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
    const { result } = renderHook(() => usePhotoDetection());

    await result.current.uploadPhoto(file);
    await waitFor(() => expect(result.current.metadata).toEqual(baseMetadata));

    result.current.reset();
    expect(result.current.metadata).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.uploading).toBe(false);
    expect(result.current.analyzing).toBe(false);
  });
});

