/**
 * Component to display material counts (dark theme)
 */
import type { Material } from '../types/detection';

interface MaterialCountProps {
  materials: Material[];
}

export function MaterialCount({ materials }: MaterialCountProps) {
  if (materials.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-slate-400">No materials detected</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {materials.map((material, index) => (
        <div
          key={index}
          className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-4"
        >
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold text-blue-300 capitalize">
                {material.type}
              </p>
              <p className="text-sm text-blue-400/80">
                {material.count} {material.unit || 'units'}
                {material.brand && ` | ${material.brand}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-blue-300">
                {((material.confidence ?? 0) * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-blue-400/60">confidence</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
