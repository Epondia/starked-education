'use client';

import React from 'react';
import { X } from 'lucide-react';

interface UploadProgressProps {
  progress: number;
  bytesLoaded: number;
  bytesTotal: number;
  onCancel?: () => void;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function UploadProgress({
  progress,
  bytesLoaded,
  bytesTotal,
  onCancel,
  className = '',
}: UploadProgressProps) {
  return (
    <div className={`mt-2 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="w-full bg-gray-200 rounded-full h-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <span className="text-xs text-gray-500 w-10 text-right">{progress}%</span>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Cancel upload"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {formatBytes(bytesLoaded)} / {formatBytes(bytesTotal)}
      </p>
    </div>
  );
}
