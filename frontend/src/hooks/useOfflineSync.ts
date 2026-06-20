import { useState, useEffect, useCallback, useRef } from 'react';
import {
  queueOfflineAction,
  getAllSyncQueueItems,
  updateSyncQueueItem,
  removeSyncQueueItem,
  clearSyncQueue,
  getSyncQueueCount,
  resolveConflict,
  getOfflineCourse,
  saveCourseOffline,
  getOfflineProgress,
  saveOfflineProgress,
  type ConflictResult
} from '../utils/offlineDB';

interface SyncQueueItem {
  id: number;
  type: 'create' | 'update' | 'delete';
  endpoint: string;
  data: any;
  courseId?: string;
  timestamp: number;
  retryCount: number;
}

interface SyncQueueItemWithStatus extends SyncQueueItem {
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  lastError?: string;
}

interface OfflineSyncOptions {
  autoSync?: boolean;
  syncInterval?: number;
  maxRetries?: number;
  backoffBase?: number;
}

interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  queuedItems: number;
  lastSyncTime?: Date;
  syncErrors: string[];
  items: SyncQueueItemWithStatus[];
}

interface QueuedItem {
  id?: number;
  payload: {
    type: string;
    endpoint?: string;
    method?: string;
    data?: any;
    courseId?: string;
  };
  queuedAt: number;
  retryCount: number;
  lastError?: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
}

const calculateBackoff = (retryCount: number, baseMs: number): number => {
  return Math.min(baseMs * Math.pow(2, retryCount), 30000);
};

export const useOfflineSync = (options: OfflineSyncOptions = {}) => {
  const {
    autoSync = true,
    syncInterval = 30000,
    maxRetries = 3,
    backoffBase = 1000
  } = options;

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    queuedItems: 0,
    syncErrors: [],
    items: []
  });

  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    loadQueueFromStorage();
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: true }));
      if (autoSync) {
        processQueue();
      }
    };

    const handleOffline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: false }));
    };

    const handleSyncCompleted = () => {
      loadQueueFromStorage();
    };

    const handleSyncFailed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setSyncStatus(prev => ({
        ...prev,
        syncErrors: [...prev.syncErrors, detail.error || 'Sync failed']
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('starked-sync-completed', handleSyncCompleted);
    window.addEventListener('starked-sync-failed', handleSyncFailed);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('starked-sync-completed', handleSyncCompleted);
      window.removeEventListener('starked-sync-failed', handleSyncFailed);
    };
  }, [autoSync]);

  useEffect(() => {
    if (autoSync && syncStatus.isOnline) {
      syncIntervalRef.current = setInterval(() => {
        const pendingCount = syncStatus.items.filter(i => i.status === 'pending').length;
        if (pendingCount > 0 && !isProcessingRef.current) {
          processQueue();
        }
      }, syncInterval);
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [autoSync, syncStatus.isOnline, syncInterval]);

  const loadQueueFromStorage = useCallback(async () => {
    try {
      if (!('indexedDB' in window)) return;
      const entries = await getAllSyncQueueItems();
      const items: SyncQueueItemWithStatus[] = entries.map((entry: QueuedItem) => ({
        id: entry.id || 0,
        type: (entry.payload.type as SyncQueueItem['type']) || 'update',
        endpoint: entry.payload.endpoint || '/api/sync',
        data: entry.payload.data || {},
        courseId: entry.payload.courseId,
        timestamp: entry.queuedAt,
        retryCount: entry.retryCount || 0,
        status: entry.status || 'pending',
        lastError: entry.lastError
      }));
      setSyncStatus(prev => ({
        ...prev,
        queuedItems: items.filter(i => i.status === 'pending' || i.status === 'failed').length,
        items
      }));
    } catch (error) {
      console.error('Error loading sync queue:', error);
    }
  }, []);

  const addToQueue = useCallback(async (type: SyncQueueItem['type'], endpoint: string, data: any, courseId?: string) => {
    try {
      await queueOfflineAction({ type, endpoint, data, courseId });
      await loadQueueFromStorage();

      if (syncStatus.isOnline && autoSync) {
        setTimeout(() => processQueue(), 500);
      }
    } catch (error) {
      console.error('Error adding to queue:', error);
    }
  }, [syncStatus.isOnline, autoSync, loadQueueFromStorage]);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || !syncStatus.isOnline) return;

    isProcessingRef.current = true;

    try {
      const entries = await getAllSyncQueueItems();
      const pending = entries.filter((e: QueuedItem) => e.status === 'pending' || e.status === 'failed');

      if (pending.length === 0) {
        isProcessingRef.current = false;
        return;
      }

      setSyncStatus(prev => ({ ...prev, isSyncing: true }));

      for (const entry of pending) {
        if (!syncStatus.isOnline) break;

        const itemId = entry.id as number;
        await updateSyncQueueItem(itemId, { status: 'syncing' });

        setSyncStatus(prev => ({
          ...prev,
          items: prev.items.map(i =>
            i.id === itemId ? { ...i, status: 'syncing' as const } : i
          )
        }));

        try {
          const method = entry.payload.method || (entry.payload.type === 'delete' ? 'DELETE' : 'POST');
          const response = await fetch(entry.payload.endpoint || '/api/sync', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method !== 'DELETE' ? JSON.stringify(entry.payload.data) : undefined,
          });

          if (response.ok) {
            const syncData = entry.payload.data || {};

            // If we have a courseId, update the offline version after successful sync
            if (entry.payload.courseId) {
              const courseId = entry.payload.courseId;
              const offlineCourse = await getOfflineCourse(courseId);
              if (offlineCourse) {
                await saveCourseOffline(courseId, offlineCourse);
              }
            }

            await updateSyncQueueItem(itemId, { status: 'synced' });
            setSyncStatus(prev => ({
              ...prev,
              items: prev.items.map(i =>
                i.id === itemId ? { ...i, status: 'synced' as const } : i
              )
            }));
          } else if (response.status === 409) {
            // Conflict - resolve using latest version strategy
            const responseData = await response.json().catch(() => ({}));
            const remoteVersion = responseData.version || 0;
            const localVersion = entry.retryCount;

            const result = resolveConflict(
              entry.payload.data,
              responseData,
              localVersion,
              remoteVersion,
              'latest'
            );

            if (result.strategy === 'remote_wins') {
              // Discard local changes
              await updateSyncQueueItem(itemId, {
                status: 'synced',
                lastError: `Conflict resolved: ${result.strategy}`
              });
              setSyncStatus(prev => ({
                ...prev,
                items: prev.items.map(i =>
                  i.id === itemId ? {
                    ...i,
                    status: 'synced' as const,
                    lastError: `Conflict resolved: ${result.strategy}`
                  } : i
                )
              }));
            } else {
              // Retry with local data
              throw new Error('Conflict - retrying with local version');
            }
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const newRetryCount = entry.retryCount + 1;

          if (newRetryCount >= maxRetries) {
            await updateSyncQueueItem(itemId, {
              status: 'failed',
              retryCount: newRetryCount,
              lastError: errorMessage
            });
            setSyncStatus(prev => ({
              ...prev,
              syncErrors: [...prev.syncErrors, `Failed to sync after ${maxRetries} retries: ${errorMessage}`],
              items: prev.items.map(i =>
                i.id === itemId ? {
                  ...i,
                  status: 'failed' as const,
                  retryCount: newRetryCount,
                  lastError: errorMessage
                } : i
              )
            }));
          } else {
            await updateSyncQueueItem(itemId, {
              status: 'pending',
              retryCount: newRetryCount,
              lastError: errorMessage
            });
            setSyncStatus(prev => ({
              ...prev,
              items: prev.items.map(i =>
                i.id === itemId ? {
                  ...i,
                  status: 'pending' as const,
                  retryCount: newRetryCount,
                  lastError: errorMessage
                } : i
              )
            }));
          }
        }
      }

      await loadQueueFromStorage();

      setSyncStatus(prev => ({
        ...prev,
        lastSyncTime: new Date(),
        isSyncing: false
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        syncErrors: [...prev.syncErrors, errorMessage]
      }));
    } finally {
      isProcessingRef.current = false;
    }
  }, [syncStatus.isOnline, maxRetries, loadQueueFromStorage]);

  const triggerSync = useCallback(() => {
    if (syncStatus.isOnline) {
      processQueue();
    } else {
      setSyncStatus(prev => ({
        ...prev,
        syncErrors: [...prev.syncErrors, 'Cannot sync while offline']
      }));
    }
  }, [syncStatus.isOnline, processQueue]);

  const clearQueue = useCallback(async () => {
    await clearSyncQueue();
    setSyncStatus(prev => ({
      ...prev,
      queuedItems: 0,
      syncErrors: [],
      items: []
    }));
  }, []);

  const removeFromQueue = useCallback(async (itemId: number) => {
    await removeSyncQueueItem(itemId);
    await loadQueueFromStorage();
  }, [loadQueueFromStorage]);

  const retryItem = useCallback(async (itemId: number) => {
    await updateSyncQueueItem(itemId, { status: 'pending', retryCount: 0, lastError: undefined });
    await loadQueueFromStorage();
    if (syncStatus.isOnline) {
      setTimeout(() => processQueue(), 500);
    }
  }, [syncStatus.isOnline, loadQueueFromStorage]);

  const retryAllFailed = useCallback(async () => {
    const entries = await getAllSyncQueueItems();
    const failed = entries.filter((e: QueuedItem) => e.status === 'failed');
    for (const entry of failed) {
      await updateSyncQueueItem(entry.id as number, { status: 'pending', retryCount: 0, lastError: undefined });
    }
    await loadQueueFromStorage();
    if (syncStatus.isOnline) {
      setTimeout(() => processQueue(), 500);
    }
  }, [syncStatus.isOnline, loadQueueFromStorage]);

  const getQueueStats = useCallback(() => {
    const items = syncStatus.items;
    return {
      total: items.length,
      pending: items.filter(i => i.status === 'pending').length,
      syncing: items.filter(i => i.status === 'syncing').length,
      synced: items.filter(i => i.status === 'synced').length,
      failed: items.filter(i => i.status === 'failed').length,
      byType: items.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byEndpoint: items.reduce((acc, item) => {
        acc[item.endpoint] = (acc[item.endpoint] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      oldestItem: items.length > 0 ? new Date(Math.min(...items.map(item => item.timestamp))) : null,
      totalRetries: items.reduce((sum, item) => sum + item.retryCount, 0)
    };
  }, [syncStatus.items]);

  // Register background sync
  useEffect(() => {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then((registration) => {
        if (registration.sync) {
          registration.sync.register('starked-offline-queue').catch(console.error);
        }
      });
    }
  }, []);

  return {
    syncStatus,
    items: syncStatus.items,
    addToQueue,
    triggerSync,
    clearQueue,
    removeFromQueue,
    retryItem,
    retryAllFailed,
    getQueueStats,
    isOnline: syncStatus.isOnline,
    isSyncing: syncStatus.isSyncing
  };
};

export const useOfflineData = <T>(key: string, initialValue?: T) => {
  const [data, setData] = useState<T | undefined>(initialValue);
  const [isOffline, setIsOffline] = useState(
    typeof navigator === 'undefined' ? false : !navigator.onLine
  );

  useEffect(() => {
    const loadData = async () => {
      try {
        if ('indexedDB' in window) {
          const { getFromContentCache } = await import('../utils/offlineDB');
          const stored = await getFromContentCache(key);
          if (stored !== undefined) {
            setData(stored);
          }
        } else {
          const stored = localStorage.getItem(`offline-${key}`);
          if (stored) {
            setData(JSON.parse(stored));
          }
        }
      } catch (error) {
        console.error('Error loading offline data:', error);
      }
    };

    loadData();

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [key]);

  const saveData = useCallback(async (newData: T) => {
    try {
      setData(newData);
      if ('indexedDB' in window) {
        const { saveToContentCache } = await import('../utils/offlineDB');
        await saveToContentCache(key, newData);
      } else {
        localStorage.setItem(`offline-${key}`, JSON.stringify(newData));
      }
    } catch (error) {
      console.error('Error saving offline data:', error);
    }
  }, [key]);

  const clearData = useCallback(async () => {
    try {
      setData(undefined);
      if ('indexedDB' in window) {
        const { removeFromContentCache } = await import('../utils/offlineDB');
        await removeFromContentCache(key);
      } else {
        localStorage.removeItem(`offline-${key}`);
      }
    } catch (error) {
      console.error('Error clearing offline data:', error);
    }
  }, [key]);

  return { data, setData: saveData, clearData, isOffline };
};
