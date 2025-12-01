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
      <div className="bg-cyan-900/30 border border-cyan-700/50 rounded-2xl p-6 flex items-center space-x-3">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400" />
        <p className="text-cyan-100">Running single-agent analysis...</p>
      </div>
    );
  }

  // Show visualization if we have overlay URL or image, even if result is not fully populated
  const hasOverlay = !!overlayUrl;
  const hasImage = !!imageUrl;
  
  if (!result && !hasOverlay && !hasImage) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
        <p className="text-slate-300 mb-3">Single-agent results are not available yet.</p>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 transition-colors"
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
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">AI Summary</h3>
              <p className="text-slate-300">{result.ai_summary || 'No summary available.'}</p>
            </div>
            {result.ai_recommendations && (
              <div>
                <h4 className="text-lg font-semibold text-white mb-1">Recommended Actions</h4>
                <p className="text-slate-300">{result.ai_recommendations}</p>
              </div>
            )}
            <p className="text-sm text-slate-400">
              Model: {result.model_version || 'single-agent-v1'}
              {result.ai_provider ? ` | AI provider: ${result.ai_provider}` : ''}
            </p>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="self-start px-4 py-2 text-sm font-medium border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors"
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
          <h3 className="text-lg font-semibold text-white">Damage Detection Overlay</h3>
          <div className="rounded-2xl overflow-hidden border border-slate-700">
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
          </div>
          {reportUrl && (
            <a
              href={reportUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-cyan-400 hover:text-cyan-300 text-sm font-medium transition-colors"
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
