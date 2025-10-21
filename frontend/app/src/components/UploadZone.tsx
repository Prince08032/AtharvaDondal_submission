'use client';

import { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function UploadZone({ onFilesSelected, disabled }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFilesSelected(files);
    }
  }, [onFilesSelected, disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files);
    }
    e.target.value = '';
  }, [onFilesSelected]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative border-2 border-dashed rounded-lg p-12 text-center transition-all
        ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400'}
      `}
    >
      <input
        type="file"
        multiple
        onChange={handleFileInput}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        accept=".jpg,.jpeg,.png,.webp,.pdf"
      />
      <Upload className="mx-auto h-12 w-12 text-gray-400" />
      <p className="mt-4 text-lg font-medium text-gray-700">
        Drop files here or click to browse
      </p>
      <p className="mt-2 text-sm text-gray-500">
        Supports: JPEG, PNG, WebP, PDF (max 50MB)
      </p>
    </div>
  );
}

