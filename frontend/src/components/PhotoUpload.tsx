/**
 * Photo upload component with drag-and-drop (dark theme)
 */
import { useCallback, useState } from 'react';

interface PhotoUploadProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export function PhotoUpload({ onFileSelect, disabled }: PhotoUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));
    
    if (imageFile) {
      onFileSelect(imageFile);
    }
  }, [disabled, onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  }, [onFileSelect]);

  return (
    <div
      className={`
        relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300
        ${isDragging
          ? 'border-cyan-400 bg-cyan-500/10 scale-[1.02]'
          : 'border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800/70'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        backdrop-blur
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        disabled={disabled}
        className="hidden"
        id="photo-upload-input"
      />
      <label
        htmlFor="photo-upload-input"
        className={`block ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {/* Upload Icon */}
        <div className={`
          mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6
          transition-all duration-300
          ${isDragging 
            ? 'bg-cyan-500/20 scale-110' 
            : 'bg-slate-700/50'
          }
        `}>
          <svg
            className={`w-10 h-10 transition-colors duration-300 ${
              isDragging ? 'text-cyan-400' : 'text-slate-400'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>

        {/* Text */}
        <p className="text-lg text-white font-medium mb-2">
          {isDragging ? 'Drop your image here' : 'Drop your roof photo here'}
        </p>
        <p className="text-slate-400 mb-4">
          or <span className="text-cyan-400 hover:text-cyan-300 transition-colors">browse files</span>
        </p>
        
        {/* File info */}
        <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            PNG, JPG, JPEG
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            Max 10MB
          </span>
        </div>
      </label>

      {/* Decorative corners */}
      <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-slate-600 rounded-tl-lg"></div>
      <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-slate-600 rounded-tr-lg"></div>
      <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-slate-600 rounded-bl-lg"></div>
      <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-slate-600 rounded-br-lg"></div>
    </div>
  );
}
