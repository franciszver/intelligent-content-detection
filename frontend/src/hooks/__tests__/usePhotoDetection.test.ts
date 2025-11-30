import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePhotoDetection } from '../usePhotoDetection';
import * as api from '../../services/api';

// Mock the API module
vi.mock('../../services/api');

describe('usePhotoDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.pollSingleAgentResults).mockResolvedValue({
      photo_id: 'test-photo-id',
      single_agent_results: { ai_summary: 'done' },
    } as any);
    vi.mocked(api.getSingleAgentResults).mockResolvedValue({
      photo_id: 'test-photo-id',
      single_agent_results: { ai_summary: 'done' },
    } as any);
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => usePhotoDetection());

    expect(result.current.uploading).toBe(false);
    expect(result.current.analyzing).toBe(false);
    expect(result.current.metadata).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should upload photo and trigger analysis', async () => {
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const mockUploadResponse = {
      photo_id: 'test-photo-id',
      s3_key: 'photos/test.jpg',
      upload_url: 'https://s3.amazonaws.com/bucket/test.jpg?signature=...',
    };
    const mockMetadata = {
      photo_id: 'test-photo-id',
      workflow_status: 'completed',
      s3_key: 'photos/test.jpg',
    };

    vi.mocked(api.getUploadUrl).mockResolvedValue(mockUploadResponse);
    vi.mocked(api.uploadPhotoToS3).mockResolvedValue(undefined);
    vi.mocked(api.analyzePhoto).mockResolvedValue({
      photo_id: 'test-photo-id',
      execution_arn: 'arn:aws:states:...',
      workflow_status: 'processing',
    });
    vi.mocked(api.pollWorkflowResults).mockResolvedValue(mockMetadata);

    const { result } = renderHook(() => usePhotoDetection());

    await result.current.uploadPhoto(mockFile, 'user-123');

    await waitFor(() => {
      expect(result.current.uploading).toBe(false);
      expect(result.current.analyzing).toBe(false);
      expect(result.current.metadata).toEqual(mockMetadata);
    });

    expect(api.getUploadUrl).toHaveBeenCalledWith('user-123');
    expect(api.uploadPhotoToS3).toHaveBeenCalledWith(mockUploadResponse.upload_url, mockFile);
    expect(api.analyzePhoto).toHaveBeenCalledWith('test-photo-id', 'photos/test.jpg');
    expect(api.pollWorkflowResults).toHaveBeenCalledWith('test-photo-id');
    expect(api.pollSingleAgentResults).toHaveBeenCalledWith('test-photo-id', 40, 2000);
  });

  it('should fallback to API upload on S3 upload error', async () => {
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const mockUploadResponse = {
      photo_id: 'test-photo-id',
      s3_key: 'photos/test.jpg',
      upload_url: 'https://s3.amazonaws.com/bucket/test.jpg?signature=...',
    };
    const mockApiUploadResponse = {
      photo_id: 'test-photo-id-api',
      s3_key: 'photos/test-api.jpg',
    };
    const mockMetadata = {
      photo_id: 'test-photo-id-api',
      workflow_status: 'completed',
      s3_key: 'photos/test-api.jpg',
    };

    vi.mocked(api.getUploadUrl).mockResolvedValue(mockUploadResponse);
    vi.mocked(api.uploadPhotoToS3).mockRejectedValue(new Error('CORS_ERROR'));
    vi.mocked(api.uploadPhotoViaApi).mockResolvedValue(mockApiUploadResponse);
    vi.mocked(api.analyzePhoto).mockResolvedValue({
      photo_id: 'test-photo-id-api',
      execution_arn: 'arn:aws:states:...',
      workflow_status: 'processing',
    });
    vi.mocked(api.pollWorkflowResults).mockResolvedValue(mockMetadata);

    const { result } = renderHook(() => usePhotoDetection());

    await result.current.uploadPhoto(mockFile, 'user-123');

    await waitFor(() => {
      expect(result.current.uploading).toBe(false);
      expect(result.current.analyzing).toBe(false);
    });

    expect(api.uploadPhotoViaApi).toHaveBeenCalledWith('user-123', mockFile);
    expect(api.analyzePhoto).toHaveBeenCalledWith('test-photo-id-api', 'photos/test-api.jpg');
    expect(api.pollSingleAgentResults).toHaveBeenCalledWith('test-photo-id-api', 40, 2000);
  });

  it('should handle upload errors', async () => {
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const error = new Error('Upload failed');

    vi.mocked(api.getUploadUrl).mockRejectedValue(error);

    const { result } = renderHook(() => usePhotoDetection());

    await result.current.uploadPhoto(mockFile);

    await waitFor(() => {
      expect(result.current.uploading).toBe(false);
      expect(result.current.error).toBe('Upload failed');
    });
  });

  it('should handle analysis errors', async () => {
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const mockUploadResponse = {
      photo_id: 'test-photo-id',
      s3_key: 'photos/test.jpg',
      upload_url: 'https://s3.amazonaws.com/bucket/test.jpg?signature=...',
    };
    const error = new Error('Analysis failed');

    vi.mocked(api.getUploadUrl).mockResolvedValue(mockUploadResponse);
    vi.mocked(api.uploadPhotoToS3).mockResolvedValue(undefined);
    vi.mocked(api.analyzePhoto).mockRejectedValue(error);

    const { result } = renderHook(() => usePhotoDetection());

    await result.current.uploadPhoto(mockFile);

    await waitFor(() => {
      expect(result.current.uploading).toBe(false);
      expect(result.current.analyzing).toBe(false);
      expect(result.current.error).toBe('Analysis failed');
    });
  });

  it('should reset state', () => {
    const { result } = renderHook(() => usePhotoDetection());

    // Set some state first
    result.current.uploadPhoto(new File(['test'], 'test.jpg', { type: 'image/jpeg' }));

    // Reset
    result.current.reset();

    expect(result.current.uploading).toBe(false);
    expect(result.current.analyzing).toBe(false);
    expect(result.current.metadata).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should manually trigger analysis', async () => {
    const mockMetadata = {
      photo_id: 'test-photo-id',
      workflow_status: 'completed',
      s3_key: 'photos/test.jpg',
    };

    vi.mocked(api.analyzePhoto).mockResolvedValue({
      photo_id: 'test-photo-id',
      execution_arn: 'arn:aws:states:...',
      workflow_status: 'processing',
    });
    vi.mocked(api.pollWorkflowResults).mockResolvedValue(mockMetadata);

    const { result } = renderHook(() => usePhotoDetection());

    await result.current.analyzePhoto('test-photo-id', 'photos/test.jpg');

    await waitFor(() => {
      expect(result.current.analyzing).toBe(false);
      expect(result.current.metadata).toEqual(mockMetadata);
    });

    expect(api.analyzePhoto).toHaveBeenCalledWith('test-photo-id', 'photos/test.jpg');
    expect(api.pollWorkflowResults).toHaveBeenCalledWith('test-photo-id');
    expect(api.pollSingleAgentResults).toHaveBeenCalledWith('test-photo-id', 40, 2000);
  });

  it('should refresh single agent results on demand', async () => {
    const { result } = renderHook(() => usePhotoDetection());
    await result.current.refreshSingleAgent('manual-photo');
    await waitFor(() => {
      expect(api.getSingleAgentResults).toHaveBeenCalledWith('manual-photo');
    });
  });
});

