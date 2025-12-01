/**
 * Component to display detection results (dark theme)
 */
import type { Detection, Material } from '../types/detection';

interface DetectionResultsProps {
  detections: Detection[];
  materials: Material[];
}

export function DetectionResults({ detections, materials }: DetectionResultsProps) {
  return (
    <div className="space-y-6">
      {/* Detections Section */}
      {detections.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Damage Detections</h3>
          <div className="space-y-2">
            {detections.map((detection, index) => (
              <div
                key={index}
                className="bg-red-900/30 border border-red-700/50 rounded-xl p-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-red-300">
                      {(detection.category || 'Unknown').charAt(0).toUpperCase() + (detection.category || 'unknown').slice(1).replace(/_/g, ' ')}
                    </p>
                    {detection.severity && (
                      <p className="text-sm text-red-400/80">
                        Severity: {detection.severity}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-red-300">
                      {((detection.confidence ?? 0) * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-red-400/60">confidence</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Materials Section */}
      {materials.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Materials Detected</h3>
          <div className="bg-slate-700/30 border border-slate-600/50 rounded-xl overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Count
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Brand
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {materials.map((material, index) => (
                  <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-white">
                      {material.type}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {material.count} {material.unit || 'units'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {material.brand || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {((material.confidence ?? 0) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {detections.length === 0 && materials.length === 0 && (
        <div className="text-center py-8">
          <p className="text-slate-400">No detections found in this image.</p>
        </div>
      )}
    </div>
  );
}
