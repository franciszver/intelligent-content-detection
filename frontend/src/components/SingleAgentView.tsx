import { DamageVisualization } from './DamageVisualization';
import { DamageCount } from './DamageCount';
import type { SingleAgentResult, Detection } from '../types/detection';

interface SingleAgentViewProps {
  result?: SingleAgentResult | null;
  imageUrl?: string | null;
  overlayUrl?: string | null;
  reportUrl?: string | null;
  analyzing: boolean;
  detections?: Detection[];
  onRefresh?: () => void;
}

export function SingleAgentView({ result, imageUrl, overlayUrl, reportUrl, analyzing, detections = [], onRefresh }: SingleAgentViewProps) {
  if (analyzing) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 flex items-center space-x-3">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        <p className="text-blue-900">Running single-agent analysis...</p>
      </div>
    );
  }

  // Show visualization if we have overlay URL or image, even if result is not fully populated
  const hasOverlay = !!overlayUrl;
  const hasImage = !!imageUrl;
  
  if (!result && !hasOverlay && !hasImage) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <p className="text-gray-700 mb-3">Single-agent results are not available yet.</p>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900"
          >
            Run Analysis
          </button>
        )}
      </div>
    );
  }

  const counts = result?.damage_counts || {};
  const damageAreas = result?.damage_areas || [];

  return (
    <div className="space-y-6">
      {/* AI Summary Section - only show if we have result data */}
      {result && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">AI Summary</h3>
              <p className="text-gray-700">{result.ai_summary || 'No summary available.'}</p>
            </div>
            {result.ai_recommendations && (
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-1">Recommended Actions</h4>
                <p className="text-gray-700">{result.ai_recommendations}</p>
              </div>
            )}
            <p className="text-sm text-gray-500">
              Model: {result.model_version || 'single-agent-v1'}
              {result.ai_provider ? ` • AI provider: ${result.ai_provider}` : ''}
            </p>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="self-start px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Re-run analysis
              </button>
            )}
          </div>
        </div>
      )}

      {/* Visual Overlay Section - show if we have image or overlay URL */}
      {(imageUrl || overlayUrl) && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">Damage Detection Overlay</h3>
          <DamageVisualization
            imageUrl={imageUrl || overlayUrl || ''}
            detections={
              damageAreas.length > 0
                ? damageAreas.map((area) => ({
                    type: 'roof_damage',
                    category: area.damage_type || 'unknown',
                    confidence: area.confidence ?? 0,
                    bbox: area.bbox,
                    severity: area.severity,
                  }))
                : detections
            }
            overlayUrl={overlayUrl || undefined}
          />
          {reportUrl && (
            <a
              href={reportUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-blue-600 hover:underline text-sm font-medium"
            >
              Download AI report
            </a>
          )}
        </div>
      )}

      {/* Damage Counts - only show if we have counts */}
      {Object.keys(counts).length > 0 && <DamageCount damageCounts={counts} />}
    </div>
  );
}
