import { DamageVisualization } from './DamageVisualization';
import { DamageCount } from './DamageCount';
import type { SingleAgentResult } from '../types/detection';

interface SingleAgentViewProps {
  result?: SingleAgentResult | null;
  imageUrl?: string | null;
  overlayUrl?: string | null;
  reportUrl?: string | null;
  analyzing: boolean;
  onRefresh?: () => void;
}

export function SingleAgentView({ result, imageUrl, overlayUrl, reportUrl, analyzing, onRefresh }: SingleAgentViewProps) {
  if (analyzing) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 flex items-center space-x-3">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        <p className="text-blue-900">Running single-agent analysis...</p>
      </div>
    );
  }

  if (!result) {
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

  const counts = result.damage_counts || {};

  return (
    <div className="space-y-6">
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

      {imageUrl && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">Visual Overlay</h3>
          <DamageVisualization
            imageUrl={imageUrl}
            detections={(result.damage_areas || []).map((area) => ({
              type: 'roof_damage',
              category: area.damage_type || 'unknown',
              confidence: area.confidence ?? 0,
              bbox: area.bbox,
              severity: area.severity,
            }))}
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

      <DamageCount damageCounts={counts} />
    </div>
  );
}
