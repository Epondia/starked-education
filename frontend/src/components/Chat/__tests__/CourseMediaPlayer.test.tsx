import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CourseMediaPlayer } from '../CourseMediaPlayer';

const mockUseMediaPlayer = jest.fn();

jest.mock('@/hooks/useMediaPlayer', () => ({
  useMediaPlayer: (options: unknown) => mockUseMediaPlayer(options)
}));

const basePlayer = {
  mediaRef: { current: null },
  status: 'ready',
  currentTime: 0,
  duration: 120,
  progress: 0,
  resumePosition: null,
  saveStatus: 'idle',
  error: null,
  retry: jest.fn(),
  saveNow: jest.fn(),
  seekTo: jest.fn()
};

const renderPlayer = (overrides: Partial<typeof basePlayer> = {}) => {
  mockUseMediaPlayer.mockReturnValue({ ...basePlayer, ...overrides });
  return render(
    <CourseMediaPlayer src="/v1.mp4" title="React Introduction" contentId="c1" courseId="course-1" />
  );
};

describe('CourseMediaPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a loading state while the media is buffering', () => {
    renderPlayer({ status: 'loading' });
    expect(screen.getByText('Loading media…')).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', () => {
    const retry = jest.fn();
    renderPlayer({
      status: 'error',
      error: 'Unable to load this media. It may be unavailable or your connection may have dropped.',
      retry
    });

    expect(screen.getByText('Unable to play this media')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Try again'));
    expect(retry).toHaveBeenCalled();
  });

  it('renders the video with a resume badge when a saved position exists', () => {
    renderPlayer({ status: 'ready', resumePosition: 45, currentTime: 0 });

    const video = screen.getByLabelText('React Introduction');
    expect(video).toBeInTheDocument();
    expect(video.tagName).toBe('VIDEO');
    expect(screen.getByText('Resuming from 0:45')).toBeInTheDocument();
  });

  it('shows a saved confirmation once progress is persisted', () => {
    renderPlayer({ saveStatus: 'saved' });
    expect(screen.getByText('Progress saved')).toBeInTheDocument();
  });

  it('shows an offline notice when a save is queued for later', () => {
    renderPlayer({ saveStatus: 'offline' });
    expect(screen.getByText('Offline — progress will sync when you reconnect')).toBeInTheDocument();
  });

  it('exposes the media player region with an accessible label', () => {
    renderPlayer();
    expect(screen.getByRole('region', { name: 'Media player for React Introduction' })).toBeInTheDocument();
  });
});
