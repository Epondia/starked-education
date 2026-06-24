const DB_NAME = 'StarkEdOfflineDB';
const DB_VERSION = 2;

interface SyncQueueEntry {
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

interface CourseCacheEntry {
  id: string;
  data: any;
  downloadedAt: number;
  version: number;
}

interface ProgressEntry {
  id: string;
  data: any;
  savedAt: number;
  version: number;
}

const MAX_STORAGE_BYTES = 50 * 1024 * 1024; // 50MB limit

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('courses')) {
        const courseStore = db.createObjectStore('courses', { keyPath: 'id' });
        courseStore.createIndex('downloadedAt', 'downloadedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('progress')) {
        const progressStore = db.createObjectStore('progress', { keyPath: 'id' });
        progressStore.createIndex('savedAt', 'savedAt', { unique: false });
        progressStore.createIndex('version', 'version', { unique: false });
      }

      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('status', 'status', { unique: false });
        syncStore.createIndex('queuedAt', 'queuedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('contentCache')) {
        const cacheStore = db.createObjectStore('contentCache', { keyPath: 'key' });
        cacheStore.createIndex('storedAt', 'storedAt', { unique: false });
        cacheStore.createIndex('size', 'size', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Course offline storage
export const saveCourseOffline = async (courseId: string, courseData: any): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('courses', 'readwrite');
    const store = transaction.objectStore('courses');
    const existingReq = store.get(courseId);
    let version = 1;

    existingReq.onsuccess = () => {
      if (existingReq.result) {
        version = (existingReq.result as CourseCacheEntry).version + 1;
      }
      const request = store.put({
        id: courseId,
        data: courseData,
        downloadedAt: Date.now(),
        version
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    };
    existingReq.onerror = () => reject(existingReq.error);
  });
};

export const getOfflineCourse = async (courseId: string): Promise<any> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('courses', 'readonly');
    const store = transaction.objectStore('courses');
    const request = store.get(courseId);
    request.onsuccess = () => resolve(request.result?.data || null);
    request.onerror = () => reject(request.error);
  });
};

export const getAllOfflineCourses = async (): Promise<any[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('courses', 'readonly');
    const store = transaction.objectStore('courses');
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result || []).map((entry: CourseCacheEntry) => entry.data));
    request.onerror = () => reject(request.error);
  });
};

export const deleteOfflineCourse = async (courseId: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('courses', 'readwrite');
    const store = transaction.objectStore('courses');
    const request = store.delete(courseId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Progress offline storage
export const saveOfflineProgress = async (id: string, progressData: any): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('progress', 'readwrite');
    const store = transaction.objectStore('progress');
    const existingReq = store.get(id);
    let version = 1;

    existingReq.onsuccess = () => {
      if (existingReq.result) {
        version = (existingReq.result as ProgressEntry).version + 1;
      }
      const request = store.put({
        id,
        data: progressData,
        savedAt: Date.now(),
        version
      });

      request.onsuccess = () => {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          navigator.serviceWorker.ready.then(registration => {
            (registration as any).sync.register('sync-progress').catch(console.error);
          });
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    };
    existingReq.onerror = () => reject(existingReq.error);
  });
};

export const getOfflineProgress = async (id: string): Promise<any> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('progress', 'readonly');
    const store = transaction.objectStore('progress');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result?.data || null);
    request.onerror = () => reject(request.error);
  });
};

export const getAllOfflineProgress = async (): Promise<any[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('progress', 'readonly');
    const store = transaction.objectStore('progress');
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result || []).map((entry: ProgressEntry) => ({ id: entry.id, data: entry.data, version: entry.version, savedAt: entry.savedAt })));
    request.onerror = () => reject(request.error);
  });
};

export const deleteOfflineProgress = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('progress', 'readwrite');
    const store = transaction.objectStore('progress');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Sync queue management
export const queueOfflineAction = async (action: any): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('syncQueue', 'readwrite');
    const store = transaction.objectStore('syncQueue');
    const entry: SyncQueueEntry = {
      payload: action,
      queuedAt: Date.now(),
      retryCount: 0,
      status: 'pending'
    };
    const request = store.add(entry);
    request.onsuccess = () => {
      // Notify service worker
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready.then(registration => {
          (registration as any).sync.register('starked-offline-queue').catch(console.error);
        });
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

export const getSyncQueue = async (): Promise<SyncQueueEntry[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('syncQueue', 'readonly');
    const store = transaction.objectStore('syncQueue');
    const index = store.index('status');
    const request = index.getAll('pending');
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const getSyncQueueByStatus = async (status: SyncQueueEntry['status']): Promise<SyncQueueEntry[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('syncQueue', 'readonly');
    const store = transaction.objectStore('syncQueue');
    const index = store.index('status');
    const request = index.getAll(status);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const getAllSyncQueueItems = async (): Promise<SyncQueueEntry[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('syncQueue', 'readonly');
    const store = transaction.objectStore('syncQueue');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const updateSyncQueueItem = async (id: number, updates: Partial<SyncQueueEntry>): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('syncQueue', 'readwrite');
    const store = transaction.objectStore('syncQueue');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (item) {
        const updated = { ...item, ...updates };
        store.put(updated);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
    transaction.onerror = () => reject(transaction.error);
  });
};

export const removeSyncQueueItem = async (id: number): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('syncQueue', 'readwrite');
    const store = transaction.objectStore('syncQueue');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const clearSyncQueue = async (): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('syncQueue', 'readwrite');
    const store = transaction.objectStore('syncQueue');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getSyncQueueCount = async (): Promise<number> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('syncQueue', 'readonly');
    const store = transaction.objectStore('syncQueue');
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getPendingSyncQueue = async (): Promise<SyncQueueEntry[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('syncQueue', 'readonly');
    const store = transaction.objectStore('syncQueue');
    const index = store.index('status');
    const request = index.getAll('pending');
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

// Content cache (arbitrary offline data)
export const saveToContentCache = async (key: string, data: any): Promise<void> => {
  const db = await initDB();

  // Check storage usage before saving
  const usage = await estimateStorageUsage();
  const dataSize = new Blob([JSON.stringify(data)]).size;

  if (usage + dataSize > MAX_STORAGE_BYTES) {
    await evictOldContent(dataSize);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('contentCache', 'readwrite');
    const store = transaction.objectStore('contentCache');
    const request = store.put({
      key,
      value: data,
      storedAt: Date.now(),
      size: dataSize
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getFromContentCache = async (key: string): Promise<any> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('contentCache', 'readonly');
    const store = transaction.objectStore('contentCache');
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value || null);
    request.onerror = () => reject(request.error);
  });
};

export const removeFromContentCache = async (key: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('contentCache', 'readwrite');
    const store = transaction.objectStore('contentCache');
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const clearContentCache = async (): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('contentCache', 'readwrite');
    const store = transaction.objectStore('contentCache');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Storage estimation and eviction
export const estimateStorageUsage = async (): Promise<number> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('contentCache', 'readonly');
    const store = transaction.objectStore('contentCache');
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result || [];
      const total = entries.reduce((sum: number, entry: any) => sum + (entry.size || 0), 0);
      resolve(total);
    };
    request.onerror = () => reject(request.error);
  });
};

const evictOldContent = async (neededBytes: number): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('contentCache', 'readwrite');
    const store = transaction.objectStore('contentCache');
    const index = store.index('storedAt');
    const request = index.getAll();

    request.onsuccess = () => {
      const entries = (request.result || []).sort((a: any, b: any) => a.storedAt - b.storedAt);
      let freed = 0;

      for (const entry of entries) {
        if (freed >= neededBytes) break;
        store.delete(entry.key);
        freed += entry.size || 0;
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

// Conflict resolution
export interface ConflictResult {
  resolved: boolean;
  strategy: 'local_wins' | 'remote_wins' | 'merged';
}

export const resolveConflict = (
  localData: any,
  remoteData: any,
  localVersion: number,
  remoteVersion: number,
  strategy: 'local_wins' | 'remote_wins' | 'latest' = 'latest'
): ConflictResult => {
  if (strategy === 'local_wins') {
    return { resolved: true, strategy: 'local_wins' };
  }
  if (strategy === 'remote_wins') {
    return { resolved: true, strategy: 'remote_wins' };
  }
  // 'latest' - use the one with higher version number
  if (localVersion >= remoteVersion) {
    return { resolved: true, strategy: 'local_wins' };
  }
  return { resolved: true, strategy: 'remote_wins' };
};

// Helper to check browser storage estimate
export const getStorageEstimate = async (): Promise<{ usage: number; quota: number; percentUsed: number } | null> => {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
      percentUsed: estimate.quota ? Math.round(((estimate.usage || 0) / estimate.quota) * 100) : 0
    };
  }
  return null;
};

// Listen for service worker messages about sync status
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SYNC_COMPLETED') {
      window.dispatchEvent(new CustomEvent('starked-sync-completed', { detail: event.data }));
    }
    if (event.data && event.data.type === 'SYNC_FAILED') {
      window.dispatchEvent(new CustomEvent('starked-sync-failed', { detail: event.data }));
    }
  });
}
