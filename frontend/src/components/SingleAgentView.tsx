import { DamageVisualization } from './DamageVisualization';
import { DamageCount } from './DamageCount';
import type { SingleAgentResultsResponse } from '../types/detection';

interface SingleAgentViewProps {
  result: SingleAgentResultsResponse | null;
  imageUrl?: string | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function SingleAgentView({ result, imageUrl, loading, error, onRefresh }: SingleAgentViewProps) {
  const single = result?.single_agent_results;

  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 flex items-center space-x-3">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        <p className="text-blue-900">Compiling best-practice analysis...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-900 mb-3">Single agent analysis failed: {error}</p>
        <button
          type="button"
          onClick={onRefresh}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry analysis
        </button>
      </div>
    );
  }

  if (!single) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <p className="text-gray-700 mb-3">Single agent results are not available yet.</p>
        <button
          type="button"
          onClick={onRefresh}
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900"
        >
          Check again
        </button>
      </div>
    );
  }

  const counts = single.damage_counts || {};

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">AI Summary</h3>
            <p className="text-gray-700">{single.ai_summary || 'No summary available.'}</p>
          </div>
          {single.ai_recommendations && (
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-1">Recommended Actions</h4>
              <p className="text-gray-700">{single.ai_recommendations}</p>
            </div>
          )}
          <p className="text-sm text-gray-500">
            Model: {single.model_version || 'single-agent-v1'}
            {single.ai_provider ? ` • AI provider: ${single.ai_provider}` : ''}
          </p>
        </div>
      </div>

      {imageUrl && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">Visual Overlay</h3>
          <DamageVisualization
            imageUrl={imageUrl}
            detections={(single.damage_areas || []).map((area) => ({
              type: 'roof_damage',
              category: area.damage_type || 'unknown',
              confidence: area.confidence ?? 0,
              bbox: area.bbox,
              severity: area.severity,
            }))}
            overlayUrl={result?.single_agent_overlay_url}
          />
          {result?.single_agent_report_url && (
            <a
              href={result.single_agent_report_url}
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

