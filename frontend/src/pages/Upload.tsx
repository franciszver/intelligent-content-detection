/**
 * Photo upload and detection page with preview confirmation flow
 */
import { useState, useEffect, useCallback } from 'react';
import { PhotoUpload } from '../components/PhotoUpload';
import { DetectionResults } from '../components/DetectionResults';
import { MaterialCount } from '../components/MaterialCount';
import { SingleAgentView } from '../components/SingleAgentView';
import { usePhotoDetection } from '../hooks/usePhotoDetection';

type PageState = 'upload' | 'preview-loading' | 'preview-confirm' | 'analyzing' | 'results' | 'error';

export function Upload() {
  const {
    uploading,
    analyzing,
    metadata,
    error,
    uploadError,
    photoId,
    uploadAndStartAnalysis,
    confirmAnalysis,
    cancelAndReset,
    reset,
  } = usePhotoDetection();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pageState, setPageState] = useState<PageState>('upload');

  // Determine page state based on hook state
  useEffect(() => {
    // Upload errors should show immediately (can't proceed without successful upload)
    if (uploadError) {
      setPageState('error');
    } else if (error && pageState !== 'preview-confirm' && pageState !== 'preview-loading') {
      // Analysis errors wait until user clicks "Yes" (per requirements)
      setPageState('error');
    } else if (metadata) {
      setPageState('results');
    } else if (analyzing) {
      setPageState('analyzing');
    }
  }, [error, uploadError, metadata, analyzing, pageState]);

  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setPageState('preview-loading');

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Start background upload and analysis
    const uploadSucceeded = await uploadAndStartAnalysis(file);

    // If upload failed, useEffect will transition to error state
    if (!uploadSucceeded) {
      return;
    }

    // Add artificial delay for "substantial" feel (800ms - 1500ms random)
    const delay = 800 + Math.random() * 700;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Move to preview confirmation
    setPageState('preview-confirm');
  }, [uploadAndStartAnalysis]);

  const handleConfirmAnalysis = useCallback(async () => {
    setPageState('analyzing');
    await confirmAnalysis();
    // State will update via useEffect when metadata arrives
  }, [confirmAnalysis]);

  const handleRejectAndReset = useCallback(() => {
    setSelectedFile(null);
    setImagePreview(null);
    cancelAndReset();
    setPageState('upload');
  }, [cancelAndReset]);

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setImagePreview(null);
    reset();
    setPageState('upload');
  }, [reset]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Roof Damage Analysis
          </h1>
          <p className="text-slate-400 mt-2">
            Upload a photo of your roof for AI-powered damage detection
          </p>
        </div>

        {/* Upload Section */}
        {pageState === 'upload' && (
          <div className="animate-fadeIn">
            <PhotoUpload onFileSelect={handleFileSelect} disabled={uploading} />
          </div>
        )}

        {/* Preview Loading Animation */}
        {pageState === 'preview-loading' && (
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-12 animate-fadeIn">
            <div className="flex flex-col items-center justify-center space-y-6">
              {/* Animated loader */}
              <div className="relative">
                <div className="w-16 h-16 border-4 border-slate-600 rounded-full"></div>
                <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-cyan-400 rounded-full animate-spin"></div>
              </div>
              <div className="text-center">
                <p className="text-lg text-white font-medium">Preparing your image...</p>
                <p className="text-sm text-slate-400 mt-1">Just a moment</p>
              </div>
            </div>
          </div>
        )}

        {/* Preview Confirmation */}
        {pageState === 'preview-confirm' && imagePreview && (
          <div className="animate-fadeIn space-y-6">
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl overflow-hidden">
              {/* Image Preview */}
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-auto max-h-[500px] object-contain bg-black"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                  <p className="text-white text-sm font-medium truncate">
                    {selectedFile?.name}
                  </p>
                  <p className="text-slate-300 text-xs">
                    {selectedFile && (selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>

              {/* Confirmation Question */}
              <div className="p-6 border-t border-slate-700">
                <h2 className="text-xl font-semibold text-white text-center mb-6">
                  Is this the correct image to analyze?
                </h2>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={handleRejectAndReset}
                    className="px-6 py-3 rounded-xl border-2 border-slate-600 text-slate-300 font-medium
                             hover:border-slate-500 hover:text-white hover:bg-slate-700/50
                             transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    No, upload different image
                  </button>
                  
                  <button
                    onClick={handleConfirmAnalysis}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 
                             text-white font-medium shadow-lg shadow-cyan-500/25
                             hover:from-cyan-400 hover:to-blue-400 hover:shadow-cyan-500/40
                             transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Yes, analyze this image
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analyzing Animation */}
        {pageState === 'analyzing' && (
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-12 animate-fadeIn">
            <div className="flex flex-col items-center justify-center space-y-6">
              {/* Pulsing analyzer animation */}
              <div className="relative">
                <div className="w-20 h-20 bg-cyan-500/20 rounded-full animate-ping absolute"></div>
                <div className="w-20 h-20 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center relative">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xl text-white font-medium">Analyzing roof damage...</p>
                <p className="text-sm text-slate-400 mt-2">
                  Our AI is examining your image for damage patterns
                </p>
              </div>
              {/* Progress dots */}
              <div className="flex gap-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {pageState === 'error' && (uploadError || error) && (
          <div className="bg-red-900/30 backdrop-blur border border-red-700/50 rounded-2xl p-8 animate-fadeIn">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-300">
                  {uploadError ? 'Upload Failed' : 'Analysis Failed'}
                </h3>
                <p className="text-red-200/80 mt-1">{uploadError || error}</p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="mt-6 w-full px-6 py-3 rounded-xl bg-red-600 text-white font-medium
                       hover:bg-red-500 transition-colors duration-200"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results Section */}
        {pageState === 'results' && metadata && (
          <div className="space-y-6 animate-fadeIn">
            <SingleAgentView
              result={metadata.single_agent_results}
              imageUrl={imagePreview}
              overlayUrl={metadata.single_agent_overlay_url}
              reportUrl={metadata.single_agent_report_url}
              analyzing={false}
              detections={metadata.detections || []}
              onRefresh={() => photoId && confirmAnalysis()}
            />

            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Detected Issues & Materials</h3>
              <DetectionResults detections={metadata.detections || []} materials={metadata.materials || []} />
            </div>

            {metadata.materials && metadata.materials.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Materials</h3>
                <MaterialCount materials={metadata.materials} />
              </div>
            )}

            {metadata.processing_time_ms && (
              <div className="bg-slate-700/30 rounded-xl p-4 text-center">
                <p className="text-sm text-slate-400">
                  Processed in {metadata.processing_time_ms}ms using {metadata.ai_provider || 'AI Inspector'}
                </p>
              </div>
            )}

            <button
              onClick={handleReset}
              className="w-full px-6 py-3 rounded-xl border-2 border-slate-600 text-slate-300 font-medium
                       hover:border-slate-500 hover:text-white hover:bg-slate-700/50
                       transition-all duration-200"
            >
              Analyze Another Photo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
