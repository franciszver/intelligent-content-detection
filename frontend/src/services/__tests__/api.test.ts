import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock instance using hoisted
const mockApiInstance = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
}));

const mockAxiosPut = vi.hoisted(() => vi.fn());

// Mock axios before importing the module
vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => mockApiInstance),
      put: mockAxiosPut,
    },
  };
});

// Import after mocking
import { getUploadUrl, uploadPhotoToS3, uploadPhotoViaApi, triggerDetection, getPhotoMetadata } from '../api';

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiInstance.post.mockClear();
    mockApiInstance.get.mockClear();
    mockAxiosPut.mockClear();
  });

  describe('getUploadUrl', () => {
    it('should get presigned upload URL', async () => {
      const mockResponse = {
        data: {
          photo_id: 'test-photo-id',
          s3_key: 'photos/test-photo-id.jpg',
          upload_url: 'https://s3.amazonaws.com/bucket/photos/test-photo-id.jpg?signature=...',
        },
      };

      mockApiInstance.post.mockResolvedValue(mockResponse);

      const result = await getUploadUrl('user-123');
      expect(result).toEqual(mockResponse.data);
      expect(mockApiInstance.post).toHaveBeenCalledWith('/photos/upload', {
        user_id: 'user-123',
        content_type: 'image/jpeg',
      });
    });
  });

  describe('uploadPhotoToS3', () => {
    it('should upload file to S3 successfully', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const presignedUrl = 'https://s3.amazonaws.com/bucket/test.jpg?signature=...';

      mockAxiosPut.mockResolvedValue({});

      await uploadPhotoToS3(presignedUrl, file);
      expect(mockAxiosPut).toHaveBeenCalledWith(presignedUrl, file, {
        headers: { 'Content-Type': 'image/jpeg' },
      });
    });

    it('should throw CORS_ERROR on CORS error', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const presignedUrl = 'https://s3.amazonaws.com/bucket/test.jpg?signature=...';

      mockAxiosPut.mockRejectedValue({
        message: 'CORS error',
        code: 'ERR_FAILED',
      });

      await expect(uploadPhotoToS3(presignedUrl, file)).rejects.toThrow('CORS_ERROR');
    });
  });

  describe('uploadPhotoViaApi', () => {
    it('should upload photo via API using base64', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const mockResponse = {
        data: {
          photo_id: 'test-photo-id',
          s3_key: 'photos/test-photo-id.jpg',
        },
      };

      mockApiInstance.post.mockResolvedValue(mockResponse);

      const result = await uploadPhotoViaApi('user-123', file);
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('triggerDetection', () => {
    it('should trigger content detection', async () => {
      const mockResponse = {
        data: {
          photo_id: 'test-photo-id',
          status: 'processing',
        },
      };

      mockApiInstance.post.mockResolvedValue(mockResponse);

      const result = await triggerDetection('test-photo-id', 'photos/test.jpg');
      expect(result).toEqual(mockResponse.data);
      expect(mockApiInstance.post).toHaveBeenCalledWith('/photos/test-photo-id/detect', {
        photo_id: 'test-photo-id',
        s3_key: 'photos/test.jpg',
      });
    });
  });

  describe('getPhotoMetadata', () => {
    it('should get photo metadata', async () => {
      const mockResponse = {
        data: {
          photo_id: 'test-photo-id',
          status: 'completed',
          s3_key: 'photos/test.jpg',
        },
      };

      mockApiInstance.get.mockResolvedValue(mockResponse);

      const result = await getPhotoMetadata('test-photo-id');
      expect(result).toEqual(mockResponse.data);
      expect(mockApiInstance.get).toHaveBeenCalledWith('/photos/test-photo-id/metadata');
    });
  });

  // Multi-agent helpers removed in the single-agent simplification.
});
