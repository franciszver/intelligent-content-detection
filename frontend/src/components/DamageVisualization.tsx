/**
 * Component to visualize damage with bounding boxes on image
 */
import { useEffect, useRef, useState } from 'react';
import type { Detection } from '../types/detection';

interface DamageVisualizationProps {
  imageUrl: string;
  detections: Detection[];
}

export function DamageVisualization({ imageUrl, detections }: DamageVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

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
          ctx.strokeStyle = detection.category === 'hail' ? '#ef4444' : 
                           detection.category === 'wind' ? '#f59e0b' : '#8b5cf6';
          ctx.lineWidth = 3;
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
          
          // Draw label background
          const label = `${detection.category} (${(detection.confidence * 100).toFixed(0)}%)`;
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
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="max-w-full h-auto border border-gray-200 rounded-lg"
        style={{ display: imageLoaded ? 'block' : 'none' }}
      />
      {!imageLoaded && (
        <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center">
          <p className="text-gray-500">Loading image...</p>
        </div>
      )}
      {detections.length === 0 && imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50 rounded-lg">
          <p className="text-gray-600">No damage detected</p>
        </div>
      )}
    </div>
  );
}

