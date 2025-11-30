/**
 * Photo upload and detection page
 */
import { useState } from 'react';
import { PhotoUpload } from '../components/PhotoUpload';
import { DetectionResults } from '../components/DetectionResults';
import { MaterialCount } from '../components/MaterialCount';
import { SingleAgentView } from '../components/SingleAgentView';
import { usePhotoDetection } from '../hooks/usePhotoDetection';

export function Upload() {
  const {
    uploading,
    analyzing,
    metadata,
    error,
    uploadPhoto,
    analyzePhoto,
    reset,
  } = usePhotoDetection();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Reset previous results
    reset();

    // Upload and detect
    await uploadPhoto(file);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setImagePreview(null);
    reset();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Upload Photo for Analysis</h1>

        {/* Upload Section */}
        {!selectedFile && (
          <div className="mb-8">
            <PhotoUpload onFileSelect={handleFileSelect} disabled={uploading || analyzing} />
          </div>
        )}

        {/* Loading States */}
        {(uploading || analyzing) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
              <p className="text-blue-900">
                {uploading ? 'Uploading photo...' : 'Analyzing roof damage...'}
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && typeof error === 'string' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
            <p className="text-red-900">Error: {error}</p>
            <button
              onClick={handleReset}
              className="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results Section */}
        {metadata && (
          <div className="space-y-6">
            <SingleAgentView
              result={metadata.single_agent_results}
              imageUrl={imagePreview}
              overlayUrl={metadata.single_agent_overlay_url}
              reportUrl={metadata.single_agent_report_url}
              analyzing={analyzing}
              onRefresh={() => metadata.photo_id && analyzePhoto(metadata.photo_id, metadata.s3_key)}
            />

            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Detected Issues & Materials</h3>
              <DetectionResults detections={metadata.detections || []} materials={metadata.materials || []} />
            </div>

            {metadata.materials?.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Materials</h3>
                <MaterialCount materials={metadata.materials} />
              </div>
            )}

            {metadata.processing_time_ms && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="text-sm text-gray-600">
                  Processed in {metadata.processing_time_ms}ms using {metadata.ai_provider || 'AI Inspector'}
                </p>
              </div>
            )}

            <button
              onClick={handleReset}
              className="mt-4 bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700"
            >
              Analyze Another Photo
            </button>
          </div>
        )}

        {/* Selected File Preview (before detection) */}
        {selectedFile && !metadata && !uploading && !analyzing && !error && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Selected Photo</h2>
            {imagePreview && (
              <img
                src={imagePreview}
                alt="Preview"
                className="max-w-full h-auto rounded-lg mb-4"
              />
            )}
            <p className="text-sm text-gray-600">File: {selectedFile.name}</p>
            <p className="text-sm text-gray-600">Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        )}
      </div>
    </div>
  );
}

