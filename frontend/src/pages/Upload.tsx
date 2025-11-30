/**
 * Photo upload and detection page
 */
import { useEffect, useState } from 'react';
import { PhotoUpload } from '../components/PhotoUpload';
import { DetectionResults } from '../components/DetectionResults';
import { DamageVisualization } from '../components/DamageVisualization';
import { MaterialCount } from '../components/MaterialCount';
import { WireframeViewer } from '../components/WireframeViewer';
import { ColorEnhancedViewer } from '../components/ColorEnhancedViewer';
import { DamageCount } from '../components/DamageCount';
import { usePhotoDetection } from '../hooks/usePhotoDetection';
import { AgentStatusList } from '../components/AgentStatusList';
import { SingleAgentView } from '../components/SingleAgentView';

export function Upload() {
  const {
    uploading,
    analyzing,
    metadata,
    error,
    uploadPhoto,
    reset,
    agentStatuses,
    singleAgentResults,
    singleAgentLoading,
    singleAgentError,
    refreshSingleAgent,
  } = usePhotoDetection();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'multi' | 'single'>('multi');

  const isCompleted =
    !!metadata &&
    (metadata.workflow_status === 'completed' || (!metadata.workflow_status && metadata.status === 'completed'));

  const overlapDetections =
    metadata?.agent3_results?.overlap_areas?.map((area) => ({
      type: 'roof_damage' as const,
      category: area.damage_type || 'unknown',
      confidence: area.confidence || 0,
      bbox: area.bbox,
      severity: area.severity,
    })) || metadata?.detections || [];

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

  useEffect(() => {
    setActiveTab('multi');
  }, [metadata?.photo_id]);

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

        {selectedFile && (
          <AgentStatusList statuses={agentStatuses} />
        )}

        {/* Loading States */}
        {(uploading || analyzing) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
              <p className="text-blue-900">
                {uploading ? 'Uploading photo...' : 'Running multi-agent analysis...'}
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
        {isCompleted && metadata && imagePreview && (
          <div className="space-y-6">
            <div className="flex gap-3 border-b border-gray-200">
              {[
                { id: 'multi' as const, label: 'Multi-Agent Results' },
                { id: 'single' as const, label: 'Single Agent' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'multi' && (
              <div className="space-y-6">
                {metadata.agent1_results?.wireframe_base64 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Structural Wireframe</h3>
                    <WireframeViewer
                      wireframeBase64={metadata.agent1_results.wireframe_base64}
                      zones={metadata.agent1_results.zones}
                    />
                  </div>
                )}

                {metadata.agent2_results?.enhanced_image_base64 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Color Enhancement</h3>
                    <ColorEnhancedViewer
                      enhancedImageBase64={metadata.agent2_results.enhanced_image_base64}
                    />
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Damage Visualization</h3>
                  <DamageVisualization
                    imageUrl={imagePreview}
                    detections={overlapDetections}
                    overlayUrl={metadata.overlay_url}
                  />
                  {metadata.report_url && (
                    <div className="mt-3">
                      <a
                        href={metadata.report_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline text-sm font-medium"
                      >
                        Download detailed damage report
                      </a>
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <DetectionResults detections={overlapDetections} materials={metadata.materials} />
                </div>

                {metadata.materials.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Materials</h3>
                    <MaterialCount materials={metadata.materials} />
                  </div>
                )}

                {metadata.agent3_results?.damage_counts && (
                  <div className="mb-6">
                    <DamageCount damageCounts={metadata.agent3_results.damage_counts} />
                  </div>
                )}

                <div className="mt-6 bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="text-sm text-gray-600">
                    Workflow status: {metadata.workflow_status || metadata.status}
                  </p>
                  {metadata.processing_time_ms && (
                    <p className="text-sm text-gray-600">
                      Processed in {metadata.processing_time_ms}ms using {metadata.ai_provider || 'AI'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'single' && (
              <SingleAgentView
                result={singleAgentResults}
                imageUrl={imagePreview}
                loading={singleAgentLoading}
                error={singleAgentError}
                onRefresh={() => metadata.photo_id && refreshSingleAgent(metadata.photo_id)}
              />
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

