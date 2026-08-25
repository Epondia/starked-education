import React from 'react';
import { AlertCircle, CheckCircle2, CloudOff, Loader2, RotateCcw } from 'lucide-react';
import { useMediaPlayer } from '@/hooks/useMediaPlayer';

interface CourseMediaPlayerProps {
  src: string;
  title: string;
  contentId: string;
  courseId?: string;
  userId?: string;
  poster?: string;
}

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
};

const SAVE_STATUS_LABELS: Record<string, { text: string; icon: React.ReactNode }> = {
  saved: { text: 'Progress saved', icon: <CheckCircle2 size={14} className="text-green-600" /> },
  saving: { text: 'Saving progress…', icon: <Loader2 size={14} className="text-blue-600 animate-spin" /> },
  offline: { text: 'Offline — progress will sync when you reconnect', icon: <CloudOff size={14} className="text-amber-600" /> }
};

export const CourseMediaPlayer: React.FC<CourseMediaPlayerProps> = ({
  src,
  title,
  contentId,
  courseId,
  userId,
  poster
}) => {
  const { mediaRef, status, currentTime, resumePosition, saveStatus, error, retry } = useMediaPlayer({
    src,
    contentId,
    courseId,
    userId
  });

  const showResumeBadge = status === 'ready' && resumePosition !== null && resumePosition > 5 && currentTime < 2;

  return (
    <div
      role="region"
      aria-label={`Media player for ${title}`}
      className="w-full bg-black rounded-lg overflow-hidden"
    >
      {status === 'error' ? (
        <div className="flex items-center justify-center min-h-[240px] bg-gray-50 p-6">
          <div className="text-center max-w-sm">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" aria-hidden="true" />
            <p className="text-gray-900 font-medium mb-1">Unable to play this media</p>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <button
              onClick={retry}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <RotateCcw size={16} aria-hidden="true" />
              <span>Try again</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              src={src}
              poster={poster}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-[480px] bg-black"
              aria-label={title}
            >
              Your browser does not support the video tag. Please download the video to view it.
            </video>

            {status === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60" aria-live="polite">
                <div className="flex items-center space-x-3 text-white">
                  <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
                  <span className="text-sm font-medium">Loading media…</span>
                </div>
              </div>
            )}

            {showResumeBadge && (
              <div
                className="absolute top-3 left-3 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-full shadow"
                aria-live="polite"
              >
                Resuming from {formatTime(resumePosition)}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-2 bg-gray-900">
            <p className="text-sm text-gray-300 truncate">{title}</p>
            {saveStatus !== 'idle' && (
              <div className="flex items-center space-x-1.5 text-xs" aria-live="polite">
                {SAVE_STATUS_LABELS[saveStatus]?.icon}
                <span className="text-gray-300">{SAVE_STATUS_LABELS[saveStatus]?.text}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CourseMediaPlayer;
