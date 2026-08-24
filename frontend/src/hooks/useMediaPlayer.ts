import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MediaProgress,
  MediaProgressStatus,
  fetchMediaProgress,
  flushPendingProgress,
  progressFromTime,
  saveMediaProgress
} from '@/lib/mediaProgress';

export type MediaPlayerStatus = 'loading' | 'ready' | 'playing' | 'paused' | 'error';

interface UseMediaPlayerOptions {
  src: string;
  contentId: string;
  courseId?: string;
  userId?: string;
  /**
   * Minimum playback position (seconds) worth resuming from.
   * Positions below this are treated as "just starting".
   */
  resumeThreshold?: number;
  /**
   * Seconds away from the end at which the media counts as completed.
   */
  completionThreshold?: number;
  /** How often (seconds) to persist progress while playing. */
  saveInterval?: number;
}

interface UseMediaPlayerReturn {
  mediaRef: React.RefObject<HTMLMediaElement>;
  status: MediaPlayerStatus;
  currentTime: number;
  duration: number;
  /** 0-100 playback progress */
  progress: number;
  /** Position the media will resume from (null when starting fresh) */
  resumePosition: number | null;
  saveStatus: MediaProgressStatus;
  error: string | null;
  /** Reloads the media source and re-attempts resume. */
  retry: () => void;
  /** Immediately persists the current position. */
  saveNow: () => void;
  /** Seeks the media element to a given position. */
  seekTo: (time: number) => void;
}

const RESUME_THRESHOLD = 5;
const COMPLETION_THRESHOLD = 1;
const SAVE_INTERVAL_MS = 5000;

export function useMediaPlayer({
  src,
  contentId,
  courseId,
  userId,
  resumeThreshold = RESUME_THRESHOLD,
  completionThreshold = COMPLETION_THRESHOLD,
  saveInterval = SAVE_INTERVAL_MS
}: UseMediaPlayerOptions): UseMediaPlayerReturn {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const [status, setStatus] = useState<MediaPlayerStatus>('loading');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<MediaProgressStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const resumeThresholdRef = useRef(resumeThreshold);
  const completionThresholdRef = useRef(completionThreshold);
  const resumePositionRef = useRef<number | null>(null);
  const saveIntervalRef = useRef(saveInterval);
  const lastSavedAtRef = useRef(0);
  const lastSavedTimeRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const savePendingRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);

  const save = useCallback(async () => {
    const media = mediaRef.current;
    if (!media || media.readyState === 0 || media.duration === 0) return;

    // Coalesce saves: if one is already in flight, remember that a newer
    // position arrived and save it once the current request finishes. This
    // avoids dropping the latest position when pause/seek fire in quick
    // succession.
    if (saveInFlightRef.current) {
      savePendingRef.current = true;
      return;
    }

    const now = Date.now();
    const timeDelta = Math.abs(media.currentTime - lastSavedTimeRef.current);
    if (now - lastSavedAtRef.current < 2000 && timeDelta < 2) return;

    saveInFlightRef.current = true;
    savePendingRef.current = false;
    lastSavedAtRef.current = now;
    lastSavedTimeRef.current = media.currentTime;
    setSaveStatus('saving');

    // Capture the position up front so a seek during the request can't
    // corrupt the payload.
    const position = media.currentTime;
    const mediaDuration = media.duration;

    try {
      const result = await saveMediaProgress({
        contentId,
        courseId,
        userId,
        currentTime: position,
        duration: mediaDuration
      });
      setSaveStatus(result.saved ? 'saved' : 'offline');
      retryCountRef.current = 0;
    } catch {
      setSaveStatus('offline');
      retryCountRef.current += 1;
    } finally {
      saveInFlightRef.current = false;
      if (savePendingRef.current) {
        savePendingRef.current = false;
        void save();
      }
    }
  }, [contentId, courseId, userId]);

  const saveNow = useCallback(() => {
    void save();
  }, [save]);

  const seekTo = useCallback((time: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = time;
    setCurrentTime(time);
    void save();
  }, [save]);

  const handleTimeUpdate = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    const { progress: nextProgress } = progressFromTime(media.currentTime, media.duration);
    setCurrentTime(media.currentTime);
    setProgress(nextProgress);
  }, []);

  const retry = useCallback(() => {
    const media = mediaRef.current;
    setError(null);
    setStatus('loading');
    // Bumping the media element's error is not enough — reload the source.
    if (media) {
      media.load();
      try {
        const playPromise = media.play();
        if (playPromise && typeof (playPromise as Promise<void>).catch === 'function') {
          (playPromise as Promise<void>).catch(() => undefined);
        }
      } catch {
        // Browsers may throw when autoplay is blocked; ignore and let the
        // learner press play.
      }
    }
  }, []);

  // Load the saved position for this media item on mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const saved = await fetchMediaProgress({ contentId, courseId, userId });
      if (!cancelled && saved) {
        resumePositionRef.current = saved.currentTime > 0 ? saved.currentTime : null;
        setResumePosition(resumePositionRef.current);
      }
      // Flush any saves that failed while offline.
      void flushPendingProgress();
    })();

    return () => {
      cancelled = true;
    };
  }, [contentId, courseId, userId]);

  // Wire up media element events.
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const handleLoadedMetadata = () => {
      const savedPosition = resumePositionRef.current;
      const mediaDuration = media.duration;
      setDuration(mediaDuration);

      // Resume only when the saved position is meaningfully into the media
      // and not essentially at the end (which would replay the ending).
      if (
        savedPosition !== null &&
        savedPosition > resumeThresholdRef.current &&
        savedPosition < mediaDuration - completionThresholdRef.current
      ) {
        media.currentTime = savedPosition;
        setCurrentTime(savedPosition);
      }

      setStatus('ready');
    };

    const handlePlay = () => setStatus('playing');
    const handlePause = () => {
      setStatus('paused');
      void save();
    };
    const handleSeeked = () => {
      setCurrentTime(media.currentTime);
      void save();
    };
    const handleEnded = () => {
      setCurrentTime(media.duration);
      setProgress(100);
      void save();
    };
    const handleWaiting = () => setStatus('loading');
    const handleCanPlay = () => setStatus((current) => (current === 'loading' ? 'ready' : current));
    const handleError = () => {
      setError('Unable to load this media. It may be unavailable or your connection may have dropped.');
      setStatus('error');
    };

    media.addEventListener('loadedmetadata', handleLoadedMetadata);
    media.addEventListener('play', handlePlay);
    media.addEventListener('pause', handlePause);
    media.addEventListener('seeked', handleSeeked);
    media.addEventListener('ended', handleEnded);
    media.addEventListener('waiting', handleWaiting);
    media.addEventListener('canplay', handleCanPlay);
    media.addEventListener('error', handleError);
    media.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      media.removeEventListener('loadedmetadata', handleLoadedMetadata);
      media.removeEventListener('play', handlePlay);
      media.removeEventListener('pause', handlePause);
      media.removeEventListener('seeked', handleSeeked);
      media.removeEventListener('ended', handleEnded);
      media.removeEventListener('waiting', handleWaiting);
      media.removeEventListener('canplay', handleCanPlay);
      media.removeEventListener('error', handleError);
      media.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [handleTimeUpdate, save]);

  // Persist progress periodically while playing so positions survive a
  // crash or a quick tab close between pause events.
  useEffect(() => {
    if (status !== 'playing') return;

    saveTimerRef.current = window.setInterval(() => {
      void save();
    }, saveIntervalRef.current);

    return () => {
      if (saveTimerRef.current) window.clearInterval(saveTimerRef.current);
    };
  }, [save, status]);

  // Persist a final position when the component unmounts mid-playback.
  useEffect(() => () => {
    void save();
  }, [save]);

  return {
    mediaRef,
    status,
    currentTime,
    duration,
    progress,
    resumePosition,
    saveStatus,
    error,
    retry,
    saveNow,
    seekTo
  };
}
