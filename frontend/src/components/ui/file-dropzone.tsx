'use client';

import React, { useRef, useState } from 'react';
import { Upload, AlertCircle } from 'lucide-react';

interface FileDropzoneProps {
  onFilesSelected: (files: FileList) => void;
  disabled?: boolean;
  multiple?: boolean;
  maxFiles?: number;
  maxSize?: number;
  acceptedTypes?: string[];
  className?: string;
}

export function FileDropzone({
  onFilesSelected,
  disabled = false,
  multiple = true,
  maxFiles = 5,
  maxSize = 100 * 1024 * 1024,
  acceptedTypes = [],
  className = '',
}: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!disabled && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload files"
      aria-disabled={disabled}
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
        isDragOver
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
      <p className="text-lg font-medium text-gray-700 mb-2">
        {isDragOver ? 'Drop to upload' : 'Drag files here or click to browse'}
      </p>
      <p className="text-sm text-gray-500 mb-4">
        Maximum {maxFiles} files, up to {Math.round(maxSize / 1024 / 1024)}MB each
      </p>
      {acceptedTypes.length > 0 && (
        <p className="text-xs text-gray-400">
          Supported: {acceptedTypes.join(', ')}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={acceptedTypes.join(',')}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
        tabIndex={-1}
      />
    </div>
  );
}
