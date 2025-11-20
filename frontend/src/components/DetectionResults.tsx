/**
 * Component to display detection results
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
          <h3 className="text-lg font-semibold mb-3">Damage Detections</h3>
          <div className="space-y-2">
            {detections.map((detection, index) => (
              <div
                key={index}
                className="bg-red-50 border border-red-200 rounded-lg p-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-red-900">
                      {detection.category.charAt(0).toUpperCase() + detection.category.slice(1)} Damage
                    </p>
                    {detection.severity && (
                      <p className="text-sm text-red-700">
                        Severity: {detection.severity}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-red-900">
                      {(detection.confidence * 100).toFixed(1)}% confidence
                    </p>
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
          <h3 className="text-lg font-semibold mb-3">Materials Detected</h3>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Count
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Brand
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {materials.map((material, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {material.type}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {material.count} {material.unit || 'units'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {material.brand || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {(material.confidence * 100).toFixed(1)}%
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
        <div className="text-center py-8 text-gray-500">
          <p>No detections found in this image.</p>
        </div>
      )}
    </div>
  );
}

