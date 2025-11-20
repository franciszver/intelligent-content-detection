/**
 * Component to display material counts
 */
import type { Material } from '../types/detection';

interface MaterialCountProps {
  materials: Material[];
}

export function MaterialCount({ materials }: MaterialCountProps) {
  if (materials.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        <p>No materials detected</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {materials.map((material, index) => (
        <div
          key={index}
          className="bg-blue-50 border border-blue-200 rounded-lg p-4"
        >
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold text-blue-900 capitalize">
                {material.type}
              </p>
              <p className="text-sm text-blue-700">
                {material.count} {material.unit || 'units'}
                {material.brand && ` • ${material.brand}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-blue-900">
                {(material.confidence * 100).toFixed(1)}% confidence
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

