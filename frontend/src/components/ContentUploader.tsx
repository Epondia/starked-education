import React, { useState, useCallback, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import ipfsClient, { IpfsUploadOptions, IpfsUploadResult, UploadProgress } from '../lib/ipfs';
import { validateFile as validateFileMeta } from '../lib/schemas';
import { FileDropzone } from './ui/file-dropzone';
import { FilePreview } from './ui/file-preview';

interface ContentUploaderProps {
  onUploadComplete?: (result: IpfsUploadResult) => void;
  onUploadError?: (error: Error) => void;
  maxFiles?: number;
  maxSize?: number;
  acceptedTypes?: string[];
  className?: string;
  disabled?: boolean;
  authToken?: string;
}

interface FileWithPreview {
  file: File;
  id: string;
  preview?: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress?: UploadProgress;
  result?: IpfsUploadResult;
  error?: string;
}

const ContentUploader: React.FC<ContentUploaderProps> = ({
  onUploadComplete,
  onUploadError,
  maxFiles = 5,
  maxSize = 100 * 1024 * 1024,
  acceptedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/wav',
    'application/pdf', 'text/plain', 'application/json', 'text/markdown'
  ],
  className = '',
  disabled = false,
  authToken
}) => {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  React.useEffect(() => {
    if (authToken) {
      ipfsClient.setAuthToken(authToken);
    }
  }, [authToken]);

  const generatePreview = (file: File): Promise<string | undefined> => {
    return new Promise((resolve) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      } else {
        resolve(undefined);
      }
    });
  };

  const validateFile = (file: File): string | null => {
    if (!acceptedTypes.includes(file.type)) {
      return 'File type not supported';
    }
    if (file.size > maxSize) {
      return `File size exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit`;
    }
    if (file.size === 0) {
      const schemaResult = validateFileMeta(file);
      if (!schemaResult.valid) return schemaResult.error;
    }
    return null;
  };

  const addFiles = async (newFiles: FileList) => {
    const validFiles: FileWithPreview[] = [];

    for (let i = 0; i < newFiles.length && validFiles.length < maxFiles - files.length; i++) {
      const file = newFiles[i];
      const error = validateFile(file);

      if (error) {
        validFiles.push({
          file,
          id: Math.random().toString(36).substr(2, 9),
          status: 'error',
          error
        });
      } else {
        const preview = await generatePreview(file);
        validFiles.push({
          file,
          id: Math.random().toString(36).substr(2, 9),
          preview,
          status: 'pending'
        });
      }
    }

    setFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const cancelUpload = useCallback((id: string) => {
    const controller = abortControllers.current.get(id);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(id);
    }
    setFiles(prev => prev.map(f =>
      f.id === id ? { ...f, status: 'error', error: 'Upload cancelled' } : f
    ));
  }, []);

  const uploadFiles = useCallback(async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    try {
      for (const fileItem of pendingFiles) {
        const controller = new AbortController();
        abortControllers.current.set(fileItem.id, controller);

        try {
          setFiles(prev => prev.map(f =>
            f.id === fileItem.id ? { ...f, status: 'uploading' } : f
          ));

          const options: IpfsUploadOptions = {
            metadata: {
              originalName: fileItem.file.name,
              uploadedAt: new Date().toISOString(),
              userAgent: navigator.userAgent
            },
            signal: controller.signal,
            onProgress: (progress) => {
              setFiles(prev => prev.map(f =>
                f.id === fileItem.id ? { ...f, progress } : f
              ));
            }
          };

          const result = await ipfsClient.uploadFile(fileItem.file, options);

          setFiles(prev => prev.map(f =>
            f.id === fileItem.id ? { ...f, status: 'completed', result } : f
          ));

          onUploadComplete?.(result);
        } catch (error) {
          if ((error as any)?.name === 'CanceledError' || (error as any)?.code === 'ERR_CANCELED') {
            return;
          }
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          setFiles(prev => prev.map(f =>
            f.id === fileItem.id ? { ...f, status: 'error', error: errorMessage } : f
          ));
          onUploadError?.(error as Error);
        } finally {
          abortControllers.current.delete(fileItem.id);
        }
      }
    } finally {
      setIsUploading(false);
    }
  }, [files, onUploadComplete, onUploadError]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getOverallProgress = (): number => {
    const uploadingFiles = files.filter(f => f.status === 'uploading');
    if (uploadingFiles.length === 0) return 0;
    const totalProgress = uploadingFiles.reduce((sum, f) => sum + (f.progress?.progress || 0), 0);
    return Math.round(totalProgress / uploadingFiles.length);
  };

  return (
    <div className={`content-uploader ${className}`}>
      <FileDropzone
        onFilesSelected={addFiles}
        disabled={disabled}
        maxFiles={maxFiles}
        maxSize={maxSize}
        acceptedTypes={acceptedTypes}
      />

      {files.length > 0 && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-700">
              Files ({files.length})
            </h3>
            <button
              onClick={uploadFiles}
              disabled={disabled || isUploading || files.filter(f => f.status === 'pending').length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading... {getOverallProgress()}%
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload Files
                </>
              )}
            </button>
          </div>

          <div className="space-y-3">
            {files.map((fileItem) => (
              <FilePreview
                key={fileItem.id}
                file={{
                  id: fileItem.id,
                  name: fileItem.file.name,
                  size: fileItem.file.size,
                  type: fileItem.file.type,
                  preview: fileItem.preview,
                  status: fileItem.status,
                  progress: fileItem.progress,
                  error: fileItem.error,
                  cid: fileItem.result?.cid,
                  gatewayUrl: fileItem.result?.gatewayUrl,
                }}
                onRemove={removeFile}
                onCancel={cancelUpload}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentUploader;
