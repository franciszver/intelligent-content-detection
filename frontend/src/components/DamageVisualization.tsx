/**
 * Component to visualize damage with bounding boxes on image (dark theme)
 * Supports both direct detections and overlay from S3
 */
import { useEffect, useRef, useState } from 'react';
import type { Detection } from '../types/detection';

interface DamageVisualizationProps {
  imageUrl: string;
  detections?: Detection[];
  overlayUrl?: string; // Presigned URL for overlay image from S3
}

export function DamageVisualization({ imageUrl, detections = [], overlayUrl }: DamageVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [overlayLoaded, setOverlayLoaded] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    setOverlayLoaded(false);
  }, [overlayUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      imageRef.current = img;
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw image
      ctx.drawImage(img, 0, 0);

      // Draw bounding boxes
      detections.forEach((detection) => {
        if (detection.bbox && detection.bbox.length === 4) {
          const [x1, y1, x2, y2] = detection.bbox;

          // Draw rectangle
          const category = detection.category || 'unknown';
          ctx.strokeStyle = category === 'hail' ? '#ef4444' :
            category === 'wind' ? '#f59e0b' : '#8b5cf6';
          ctx.lineWidth = 3;
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

          // Draw label background
          const label = `${category} (${((detection.confidence ?? 0) * 100).toFixed(0)}%)`;
          ctx.font = '14px Arial';
          const textMetrics = ctx.measureText(label);
          const textHeight = 20;
          const textY = y1 - 5;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(
            x1,
            textY - textHeight,
            textMetrics.width + 10,
            textHeight
          );

          // Draw label text
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, x1 + 5, textY - 8);
        }
      });

      setImageLoaded(true);
    };

    img.src = imageUrl;
  }, [imageUrl, detections]);

  return (
    <div className="space-y-3">
      <div className="relative inline-block w-full">
        <canvas
          ref={canvasRef}
          className="max-w-full h-auto border border-slate-700 rounded-xl"
          style={{ display: imageLoaded ? 'block' : 'none' }}
        />
        {!imageLoaded && (
          <div className="w-full h-64 bg-slate-800 rounded-xl flex items-center justify-center">
            <p className="text-slate-400">Loading image...</p>
          </div>
        )}

        {detections.length === 0 && imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 rounded-xl pointer-events-none">
            <p className="text-slate-300">No damage detected</p>
          </div>
        )}

        {overlayUrl && showOverlay && (
          <>
            {!overlayLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 rounded-xl pointer-events-none">
                <p className="text-slate-300 text-sm">Loading overlay...</p>
              </div>
            )}
            <img
              src={overlayUrl}
              alt="Damage Overlay"
              className="absolute inset-0 w-full h-full object-contain rounded-xl pointer-events-none opacity-65 mix-blend-multiply"
              onLoad={() => setOverlayLoaded(true)}
            />
          </>
        )}
      </div>

      {overlayUrl && (
        <button
          type="button"
          onClick={() => setShowOverlay((prev) => !prev)}
          className="text-sm px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors"
        >
          {showOverlay ? 'Hide overlay' : 'Show overlay'}
        </button>
      )}
    </div>
  );
}
