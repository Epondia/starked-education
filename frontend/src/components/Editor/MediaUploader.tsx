/**
 * Media Uploader Component
 * Handles file uploads for images, videos, and documents
 */

import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, File, Image as ImageIcon, Video, Music, Link as LinkIcon, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Image from 'next/image';

interface MediaFile {
  id: string;
  file: File;
  name: string;
  type: string;
  size: number;
  url?: string;
  uploading: boolean;
  progress: number;
  error?: string;
}

interface MediaUploaderProps {
  onUpload?: (files: MediaFile[]) => void;
  onRemove?: (fileId: string) => void;
  maxFiles?: number;
  maxFileSize?: number; // in bytes
  acceptedTypes?: string[];
  multiple?: boolean;
  className?: string;
  disabled?: boolean;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  onUpload,
  onRemove,
  maxFiles = 10,
  maxFileSize = 10 * 1024 * 1024, // 10MB
  acceptedTypes = ['image/*', 'video/*', 'application/pdf'],
  multiple = true,
  className = '',
  disabled = false
}) => {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Validate file
  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxFileSize) {
      return `File size exceeds ${formatFileSize(maxFileSize)} limit`;
    }

    // Check file type
    const isValidType = acceptedTypes.some(type => {
      if (type.endsWith('/*')) {
        return file.type.startsWith(type.slice(0, -2));
      }
      return file.type === type;
    });

    if (!isValidType) {
      return `File type ${file.type} is not supported`;
    }

    return null;
  };

  // Handle file selection
  const handleFileSelect = useCallback((selectedFiles: FileList | File[]) => {
    if (disabled) return;

    const newFiles: MediaFile[] = [];
    const currentFileCount = files.length;

    for (let i = 0; i < selectedFiles.length && currentFileCount + newFiles.length < maxFiles; i++) {
      const file = selectedFiles[i];
      const error = validateFile(file);

      const mediaFile: MediaFile = {
        id: `${Date.now()}-${i}`,
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        uploading: false,
        progress: 0,
        error: error || undefined
      };

      newFiles.push(mediaFile);
    }

    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
      uploadFiles(newFiles);
    }
  }, [files.length, maxFiles, disabled, validateFile]);

  // Upload files
  const uploadFiles = useCallback(async (filesToUpload: MediaFile[]) => {
    setIsUploading(true);

    const uploadPromises = filesToUpload.map(async (mediaFile) => {
      try {
        // Update file status to uploading
        setFiles(prev => prev.map(f => 
          f.id === mediaFile.id 
            ? { ...f, uploading: true, progress: 0 }
            : f
        ));

        // Create FormData
        const formData = new FormData();
        formData.append('file', mediaFile.file);

        // Simulate upload progress
        const progressInterval = setInterval(() => {
          setFiles(prev => prev.map(f => 
            f.id === mediaFile.id && f.uploading
              ? { ...f, progress: Math.min(f.progress + 10, 90) }
              : f
          ));
        }, 200);

        // Upload file (in real implementation, this would be an API call)
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate upload time

        clearInterval(progressInterval);

        // Get file URL (in real implementation, this would come from the API response)
        const fileUrl = URL.createObjectURL(mediaFile.file);

        // Update file with success status
        setFiles(prev => prev.map(f => 
          f.id === mediaFile.id 
            ? { ...f, uploading: false, progress: 100, url: fileUrl }
            : f
        ));

        return { ...mediaFile, url: fileUrl };
      } catch (error) {
        // Update file with error status
        setFiles(prev => prev.map(f => 
          f.id === mediaFile.id 
            ? { ...f, uploading: false, error: error instanceof Error ? error.message : 'Upload failed' }
            : f
        ));

        throw error;
      }
    });

    try {
      const uploadedFiles = await Promise.all(uploadPromises);
      onUpload?.(uploadedFiles);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  }, [onUpload]);

  // Handle file input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      handleFileSelect(selectedFiles);
    }
  };

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles) {
      handleFileSelect(droppedFiles);
    }
  };

  // Remove file
  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
    onRemove?.(fileId);
  };

  // Clear all files
  const clearFiles = () => {
    setFiles([]);
  };

  // Trigger file input click
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) {
      return <FileImage className="w-5 h-5" />;
    } else if (type.startsWith('video/')) {
      return <FileVideo className="w-5 h-5" />;
    } else {
      return <FileText className="w-5 h-5" />;
    }
  };

  const getFileStatusIcon = (file: MediaFile) => {
    if (file.error) {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    } else if (file.uploading) {
      return (
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin border-t-blue-500"></div>
      );
    } else if (file.url) {
      return <Check className="w-4 h-4 text-green-500" />;
    }
    return null;
  };

  return (
    <div className={`media-uploader ${className}`}>
      {/* Upload Area */}
      <div
        className={`upload-area border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400 bg-gray-50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!disabled ? triggerFileSelect : undefined}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={acceptedTypes.join(',')}
          onChange={handleInputChange}
          disabled={disabled}
          className="hidden"
        />
        
        <div className="upload-content">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            {isUploading ? 'Uploading...' : 'Drop files here or click to browse'}
          </h3>
          <p className="text-sm text-gray-500">
            {multiple ? `Up to ${maxFiles} files` : 'Single file'} • Max {formatFileSize(maxFileSize)} each
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Supported: {acceptedTypes.join(', ')}
          </p>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="file-list mt-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-medium text-gray-900">
              Files ({files.length}/{maxFiles})
            </h4>
            <button
              onClick={clearFiles}
              disabled={isUploading}
              className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map((file) => (
              <div
                key={file.id}
                className="file-item border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                {/* File Preview */}
                <div className="file-preview mb-3">
                  {file.type.startsWith('image/') && file.url ? (
                    <div className="relative w-full h-32">
                      <Image
                        src={file.url}
                        alt={file.name}
                        fill
                        className="object-cover rounded"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-32 bg-gray-100 rounded flex items-center justify-center">
                      {getFileIcon(file.type)}
                    </div>
                  )}
                </div>

                {/* File Info */}
                <div className="file-info">
                  <div className="flex justify-between items-start mb-2">
                    <h5 className="text-sm font-medium text-gray-900 truncate flex-1">
                      {file.name}
                    </h5>
                    <button
                      onClick={() => removeFile(file.id)}
                      disabled={isUploading}
                      className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="text-xs text-gray-500 mb-2">
                    {formatFileSize(file.size)}
                  </div>

                  {/* Upload Progress */}
                  {file.uploading && (
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-600">Uploading...</span>
                        <span className="text-xs text-gray-600">{file.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${file.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {file.error && (
                    <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                      {file.error}
                    </div>
                  )}

                  {/* Success Indicator */}
                  {!file.uploading && file.url && !file.error && (
                    <div className="flex items-center text-xs text-green-600">
                      <Check className="w-3 h-3 mr-1" />
                      Ready
                    </div>
                  )}
                </div>

                {/* File Actions */}
                <div className="file-actions flex gap-2">
                  {file.url && (
                    <button
                      className="flex-1 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                      onClick={() => {
                        // In real implementation, this would trigger download or preview
                        window.open(file.url, '_blank');
                      }}
                    >
                      Preview
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Progress Indicator */}
      {isUploading && (
        <div className="upload-progress mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3"></div>
            <span className="text-sm text-blue-700">
              Uploading files... Please don't close this window.
            </span>
          </div>
        </div>
      )}

      <style jsx>{`
        .media-uploader {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .upload-area {
          transition: all 0.3s ease;
        }
        
        .upload-area:hover {
          border-color: #3b82f6;
        }
        
        .file-item {
          transition: all 0.3s ease;
        }
        
        .file-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .file-preview img {
          transition: transform 0.3s ease;
        }
        
        .file-preview img:hover {
          transform: scale(1.05);
        }
        
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};
