/**
 * Photo upload and detection page
 */
import { useState } from 'react';
import { PhotoUpload } from '../components/PhotoUpload';
import { DetectionResults } from '../components/DetectionResults';
import { DamageVisualization } from '../components/DamageVisualization';
import { MaterialCount } from '../components/MaterialCount';
import { usePhotoDetection } from '../hooks/usePhotoDetection';

export function Upload() {
  const { uploading, detecting, metadata, error, uploadPhoto, reset } = usePhotoDetection();
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
            <PhotoUpload onFileSelect={handleFileSelect} disabled={uploading || detecting} />
          </div>
        )}

        {/* Loading States */}
        {(uploading || detecting) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
              <p className="text-blue-900">
                {uploading ? 'Uploading photo...' : 'Analyzing photo with AI...'}
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
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
        {metadata && metadata.status === 'completed' && imagePreview && (
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-semibold mb-4">Analysis Results</h2>
              
              {/* Image with bounding boxes */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Damage Visualization</h3>
                <DamageVisualization
                  imageUrl={imagePreview}
                  detections={metadata.detections}
                />
              </div>

              {/* Detection Results */}
              <div className="mb-6">
                <DetectionResults
                  detections={metadata.detections}
                  materials={metadata.materials}
                />
              </div>

              {/* Material Count */}
              {metadata.materials.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Materials</h3>
                  <MaterialCount materials={metadata.materials} />
                </div>
              )}

              {/* Processing Info */}
              <div className="mt-6 bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">
                  Processed in {metadata.processing_time_ms}ms using {metadata.ai_provider || 'AI'}
                </p>
              </div>

              {/* Reset Button */}
              <button
                onClick={handleReset}
                className="mt-6 bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700"
              >
                Analyze Another Photo
              </button>
            </div>
          </div>
        )}

        {/* Selected File Preview (before detection) */}
        {selectedFile && !metadata && !uploading && !detecting && !error && (
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

