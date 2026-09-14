/**
 * Auto Save Hook
 * Automatically saves content at specified intervals
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface AutoSaveOptions {
  interval?: number; // in milliseconds
  debounceMs?: number; // debounce time in milliseconds
  maxRetries?: number;
  onSave?: (content: string) => Promise<void>;
  onError?: (error: Error) => void;
}

interface AutoSaveStatus {
  isSaving: boolean;
  lastSaved: Date | null;
  saveCount: number;
  lastError: Error | null;
  isDirty: boolean;
}

export const useAutoSave = (
  initialContent: string = '',
  options: AutoSaveOptions = {}
) => {
  const {
    interval = 30000, // 30 seconds
    debounceMs = 2000, // 2 seconds
    maxRetries = 3,
    onSave,
    onError
  } = options;

  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<AutoSaveStatus>({
    isSaving: false,
    lastSaved: null,
    saveCount: 0,
    lastError: null,
    isDirty: false
  });

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  // Check if content has changed
  const hasContentChanged = useCallback((newContent: string) => {
    return newContent !== content;
  }, [content]);

  // Save content to backend/storage
  const saveContent = useCallback(async (contentToSave: string, retryCount = 0) => {
    setStatus(prev => ({
      ...prev,
      isSaving: true,
      saveCount: prev.saveCount + 1,
      lastError: null
    }));

    try {
      await onSave?.(contentToSave);
      
      setStatus(prev => ({
        ...prev,
        isSaving: false,
        lastSaved: new Date(),
        saveCount: prev.saveCount + 1,
        isDirty: false
      }));
      
      retryCountRef.current = 0;
    } catch (error) {
      console.error('Auto-save failed:', error);
      
      setStatus(prev => ({
        ...prev,
        isSaving: false,
        lastError: error instanceof Error ? error : new Error('Save failed'),
        saveCount: prev.saveCount + 1,
        isDirty: true
      }));
      
      onError?.(error instanceof Error ? error : new Error('Save failed'));
      
      // Retry logic
      if (retryCount < maxRetries) {
        const delay = Math.min(Math.pow(2, retryCount) * 1000, 10000); // Exponential backoff
        retryTimeoutRef.current = setTimeout(() => {
          saveContent(contentToSave, retryCount + 1);
        }, delay);
      }
    }
  }, [onSave, onError, maxRetries]);

  // Manual save trigger — saves when there are unsaved changes. Comparing
  // against the current `content` would always be false (content === content),
  // so the dirty flag is used instead.
  const saveNow = useCallback(() => {
    if (content && status.isDirty) {
      saveContent(content);
    }
  }, [content, status.isDirty, saveContent]);

  // Debounced save function
  const debouncedSave = useCallback(
    (contentToSave: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        saveContent(contentToSave);
      }, debounceMs);
    },
    [saveContent, debounceMs, saveContent]
  );

  // Auto-save effect
  useEffect(() => {
    if (!interval || !onSave) return;

    const autoSaveInterval = setInterval(() => {
      if (status.isDirty && !status.isSaving) {
        debouncedSave(content);
      }
    }, interval);

    return () => {
      clearInterval(autoSaveInterval);
    };
  }, [status.isDirty, status.isSaving, content, interval, debouncedSave, saveContent]);

  // Update content and mark as dirty
  const updateContent = useCallback((newContent: string) => {
    setContent(newContent);
    setStatus(prev => ({
      ...prev,
      isDirty: hasContentChanged(newContent),
      lastSaved: prev.lastSaved,
      saveCount: prev.saveCount
    }));
  }, [hasContentChanged]);

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Reset status
  const resetStatus = useCallback(() => {
    setStatus({
      isSaving: false,
      lastSaved: null,
      saveCount: 0,
      lastError: null,
      isDirty: false
    });
    retryCountRef.current = 0;
  }, []);

  // Force save regardless of dirty status
  const forceSave = useCallback(() => {
    saveContent(content);
  }, [content, saveContent]);

  return {
    content,
    setContent: updateContent,
    saveNow,
    forceSave,
    status,
    resetStatus
  };
};
