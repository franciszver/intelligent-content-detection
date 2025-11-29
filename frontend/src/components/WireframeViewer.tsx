/**
 * Component to display wireframe image with zone boundaries
 */
interface WireframeViewerProps {
  wireframeBase64: string;
  zones?: Array<{
    zone_type: string;
    bbox: number[];
    confidence?: number;
  }>;
}

export function WireframeViewer({ wireframeBase64, zones }: WireframeViewerProps) {
  const imageUrl = `data:image/png;base64,${wireframeBase64}`;

  return (
    <div className="space-y-4">
      <div className="relative">
        <img
          src={imageUrl}
          alt="Wireframe"
          className="max-w-full h-auto border border-gray-200 rounded-lg"
        />
      </div>
      {zones && zones.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-semibold mb-2">Roof Zones Detected:</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {zones.map((zone, index) => (
              <div key={index} className="text-sm">
                <span className="font-medium">{zone.zone_type}:</span>{' '}
                {zone.confidence ? `${(zone.confidence * 100).toFixed(0)}%` : 'N/A'}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

