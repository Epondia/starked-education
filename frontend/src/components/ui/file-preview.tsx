'use client';

import React from 'react';
import { File, Image, Video, Music, FileText, CheckCircle, AlertCircle, Loader2, X, Copy } from 'lucide-react';

interface FilePreviewData {
  id: string;
  name: string;
  size: number;
  type: string;
  preview?: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress?: { progress: number; bytesLoaded: number; bytesTotal: number };
  error?: string;
  cid?: string;
  gatewayUrl?: string;
}

interface FilePreviewProps {
  file: FilePreviewData;
  onRemove: (id: string) => void;
  onCancel?: (id: string) => void;
  className?: string;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <Image className="w-5 h-5" />;
  if (mimeType.startsWith('video/')) return <Video className="w-5 h-5" />;
  if (mimeType.startsWith('audio/')) return <Music className="w-5 h-5" />;
  if (mimeType.includes('pdf') || mimeType.includes('text')) return <FileText className="w-5 h-5" />;
  return <File className="w-5 h-5" />;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function FilePreview({ file, onRemove, onCancel, className = '' }: FilePreviewProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopyCid = async () => {
    if (file.cid) {
      await navigator.clipboard.writeText(file.cid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={`border rounded-lg p-4 ${
        file.status === 'error' ? 'border-red-300 bg-red-50' : 'border-gray-200'
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {file.preview ? (
            <img
              src={file.preview}
              alt={file.name}
              className="w-12 h-12 object-cover rounded"
            />
          ) : (
            <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
              {getFileIcon(file.type)}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-500">
                {formatFileSize(file.size)} &bull; {file.type}
              </p>
            </div>

            <div className="flex items-center gap-2 ml-2">
              {file.status === 'pending' && <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />}
              {file.status === 'uploading' && <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
              {file.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-600" />}
              {file.status === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
              {file.status !== 'uploading' && (
                <button
                  onClick={() => onRemove(file.id)}
                  className="p-1 hover:bg-gray-100 rounded"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
              {file.status === 'uploading' && onCancel && (
                <button
                  onClick={() => onCancel(file.id)}
                  className="p-1 hover:bg-gray-100 rounded"
                  aria-label="Cancel upload"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>
          </div>

          {file.status === 'uploading' && file.progress && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="w-full bg-gray-200 rounded-full h-2" role="progressbar" aria-valuenow={file.progress.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${file.progress.progress}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">{file.progress.progress}%</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {formatFileSize(file.progress.bytesLoaded)} / {formatFileSize(file.progress.bytesTotal)}
              </p>
            </div>
          )}

          {file.status === 'error' && file.error && (
            <p className="text-xs text-red-600 mt-1">{file.error}</p>
          )}

          {file.status === 'completed' && file.cid && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
              <code className="bg-gray-100 px-1 rounded truncate max-w-[200px]">{file.cid}</code>
              <button
                onClick={handleCopyCid}
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                <Copy className="w-3 h-3" />
                {copied ? 'Copied!' : 'Copy CID'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
