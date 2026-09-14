/**
 * Media progress persistence.
 *
 * Course media progress is saved to the backend API when available and
 * mirrored to localStorage so playback can resume even when the API is
 * unreachable (offline, staging without the courses service, etc.).
 *
 * Failed saves are queued locally and retried later via {@link flushPendingProgress}
 * (call it on mount and on the browser `online` event).
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const PROGRESS_CACHE_KEY = 'starked:media-progress:v1';
const PENDING_PROGRESS_KEY = 'starked:media-progress:pending:v1';

export interface MediaProgress {
  contentId: string;
  courseId?: string;
  userId?: string;
  /** Playback position in seconds */
  currentTime: number;
  /** Media duration in seconds */
  duration: number;
  /** 0-100 */
  progress: number;
  completed: boolean;
  /** ISO timestamp of the last update */
  updatedAt: string;
}

export interface SaveMediaProgressInput {
  contentId: string;
  courseId?: string;
  userId?: string;
  currentTime: number;
  duration: number;
}

export interface SaveMediaProgressResult {
  saved: boolean;
  /** True when the save failed but was queued for a later retry */
  queued: boolean;
  progress: MediaProgress;
}

export type MediaProgressStatus = 'idle' | 'saving' | 'saved' | 'offline';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const cacheKeyFor = (contentId: string, userId?: string) => `${contentId}::${userId || 'anonymous'}`;

const readCache = (): Record<string, MediaProgress> => {
  if (typeof window === 'undefined') return {};
  return safeParse<Record<string, MediaProgress>>(window.localStorage.getItem(PROGRESS_CACHE_KEY), {});
};

const writeCache = (entries: Record<string, MediaProgress>) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROGRESS_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable — progress simply won't be cached locally.
  }
};

const readPending = (): SaveMediaProgressInput[] => {
  if (typeof window === 'undefined') return [];
  return safeParse<SaveMediaProgressInput[]>(window.localStorage.getItem(PENDING_PROGRESS_KEY), []);
};

const writePending = (entries: SaveMediaProgressInput[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_PROGRESS_KEY, JSON.stringify(entries));
  } catch {
    // Best effort — nothing else we can do if storage is unavailable.
  }
};

const authHeaders = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  const token = window.localStorage.getItem('token') || window.localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Normalizes API responses that may be wrapped as `{ success, data }`.
 */
const unwrapData = <T>(payload: T | { data: T }): T =>
  payload && typeof payload === 'object' && 'data' in payload
    ? (payload as { data: T }).data
    : (payload as T);

/**
 * Derives percentage progress and completion from a playback position.
 * A media item counts as completed once it has been played to within a
 * second of its end (guards against duration reporting jitter).
 */
export const progressFromTime = (currentTime: number, duration: number): { progress: number; completed: boolean } => {
  const safeDuration = duration > 0 ? duration : 0;
  const safeTime = Math.max(0, currentTime);
  if (safeDuration === 0) return { progress: 0, completed: false };
  const progress = clamp(Math.round((safeTime / safeDuration) * 100), 0, 100);
  const completed = safeDuration > 0 && safeTime >= safeDuration - 1;
  return { progress, completed };
};

export const toMediaProgress = (input: SaveMediaProgressInput): MediaProgress => {
  const { progress, completed } = progressFromTime(input.currentTime, input.duration);
  return {
    contentId: input.contentId,
    courseId: input.courseId,
    userId: input.userId,
    currentTime: Math.max(0, input.currentTime),
    duration: Math.max(0, input.duration),
    progress,
    completed,
    updatedAt: new Date().toISOString()
  };
};

/**
 * Returns the last known progress for a piece of media. Prefers the server,
 * falling back to the locally cached position so playback can still resume
 * when the API is unavailable.
 */
export const fetchMediaProgress = async (input: {
  contentId: string;
  courseId?: string;
  userId?: string;
}): Promise<MediaProgress | null> => {
  const cached = readCache()[cacheKeyFor(input.contentId, input.userId)] || null;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/progress/content/${encodeURIComponent(input.contentId)}`, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      }
    });

    if (!response.ok) return cached;

    const payload = await response.json();
    const serverProgress = unwrapData<Partial<MediaProgress>>(payload);

    if (!serverProgress || !serverProgress.contentId) return cached;

    const merged: MediaProgress = {
      ...cached,
      ...serverProgress,
      contentId: input.contentId,
      courseId: serverProgress.courseId || input.courseId,
      userId: serverProgress.userId || input.userId,
      currentTime: Number(serverProgress.currentTime) || 0,
      duration: Number(serverProgress.duration) || 0,
      progress: Number(serverProgress.progress) || 0,
      completed: Boolean(serverProgress.completed),
      updatedAt: serverProgress.updatedAt || cached?.updatedAt || new Date().toISOString()
    };

    const cache = readCache();
    cache[cacheKeyFor(input.contentId, input.userId)] = merged;
    writeCache(cache);

    return merged;
  } catch {
    return cached;
  }
};

/**
 * Persists a playback position. Saves to the API and mirrors to the local
 * cache. When the API call fails the save is queued and retried by
 * {@link flushPendingProgress}, so progress degrades gracefully offline.
 */
export const saveMediaProgress = async (input: SaveMediaProgressInput): Promise<SaveMediaProgressResult> => {
  const progress = toMediaProgress(input);
  const cacheKey = cacheKeyFor(input.contentId, input.userId);

  // Mirror to the local cache first so the current session and offline
  // resumes always have the freshest position.
  const cache = readCache();
  cache[cacheKey] = progress;
  writeCache(cache);

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify({
        content: input.contentId,
        courseId: input.courseId,
        userId: input.userId,
        currentTime: progress.currentTime,
        duration: progress.duration,
        progress: progress.progress,
        completed: progress.completed,
        timestamp: progress.updatedAt
      })
    });

    if (!response.ok) throw new Error(`Failed to save progress: ${response.status}`);

    return { saved: true, queued: false, progress };
  } catch {
    const pending = readPending();
    const filtered = pending.filter((entry) => !(entry.contentId === input.contentId && entry.userId === input.userId));
    filtered.push(input);
    writePending(filtered.slice(-50));
    return { saved: false, queued: true, progress };
  }
};

/**
 * Retries queued progress saves (for example when the browser comes back
 * online). Returns the number of saves that were flushed successfully.
 */
export const flushPendingProgress = async (): Promise<number> => {
  const pending = readPending();
  if (pending.length === 0) return 0;

  const remaining: SaveMediaProgressInput[] = [];
  let flushed = 0;

  for (const entry of pending) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({
          content: entry.contentId,
          courseId: entry.courseId,
          userId: entry.userId,
          currentTime: entry.currentTime,
          duration: entry.duration,
          timestamp: new Date().toISOString()
        })
      });
      if (response.ok) {
        flushed += 1;
      } else {
        remaining.push(entry);
      }
    } catch {
      remaining.push(entry);
    }
  }

  writePending(remaining);
  return flushed;
};
