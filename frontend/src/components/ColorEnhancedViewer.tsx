/**
 * Component to display color-enhanced image
 */
interface ColorEnhancedViewerProps {
  enhancedImageBase64: string;
}

export function ColorEnhancedViewer({ enhancedImageBase64 }: ColorEnhancedViewerProps) {
  const imageUrl = `data:image/jpeg;base64,${enhancedImageBase64}`;

  return (
    <div className="space-y-4">
      <div className="relative">
        <img
          src={imageUrl}
          alt="Color Enhanced"
          className="max-w-full h-auto border border-gray-200 rounded-lg"
        />
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-900">
          This image has been enhanced using histogram equalization and CLAHE to highlight color anomalies and discoloration patterns.
        </p>
      </div>
    </div>
  );
}

