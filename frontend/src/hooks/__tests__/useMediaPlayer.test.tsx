import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useMediaPlayer } from '../useMediaPlayer';

const mockFetchMediaProgress = jest.fn();
const mockSaveMediaProgress = jest.fn();
const mockFlushPendingProgress = jest.fn();

jest.mock('@/lib/mediaProgress', () => {
  const actual = jest.requireActual('@/lib/mediaProgress');
  return {
    ...actual,
    fetchMediaProgress: (...args: unknown[]) => mockFetchMediaProgress(...args),
    saveMediaProgress: (...args: unknown[]) => mockSaveMediaProgress(...args),
    flushPendingProgress: (...args: unknown[]) => mockFlushPendingProgress(...args)
  };
});

const PlayerHarness: React.FC<{ src: string; contentId: string; courseId?: string; resumeThreshold?: number }> = ({
  src,
  contentId,
  courseId,
  resumeThreshold
}) => {
  const { mediaRef, status, currentTime, progress, resumePosition, saveStatus, error, retry, saveNow, seekTo } =
    useMediaPlayer({ src, contentId, courseId, resumeThreshold });

  return (
    <div>
      <video ref={mediaRef as React.RefObject<HTMLVideoElement>} data-testid="media" />
      <span data-testid="status">{status}</span>
      <span data-testid="currentTime">{currentTime}</span>
      <span data-testid="progress">{progress}</span>
      <span data-testid="resume">{resumePosition === null ? 'null' : resumePosition}</span>
      <span data-testid="saveStatus">{saveStatus}</span>
      <span data-testid="error">{error || ''}</span>
      <button onClick={saveNow}>save-now</button>
      <button onClick={() => seekTo(42)}>seek</button>
      <button onClick={retry}>retry</button>
    </div>
  );
};

const getMedia = () => screen.getByTestId('media') as HTMLVideoElement;

const setMediaState = (media: HTMLVideoElement, { duration = 120, readyState = 1, currentTime = 0 } = {}) => {
  Object.defineProperty(media, 'duration', { value: duration, configurable: true });
  Object.defineProperty(media, 'readyState', { value: readyState, configurable: true });
  media.currentTime = currentTime;
};

describe('useMediaPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchMediaProgress.mockResolvedValue(null);
    mockSaveMediaProgress.mockResolvedValue({ saved: true, queued: false, progress: {} });
    mockFlushPendingProgress.mockResolvedValue(0);
  });

  it('resumes from the saved position once metadata is loaded', async () => {
    mockFetchMediaProgress.mockResolvedValue({
      contentId: 'c1',
      courseId: 'course-1',
      currentTime: 45,
      duration: 120,
      progress: 37,
      completed: false,
      updatedAt: '2026-01-01T00:00:00.000Z'
    });

    render(<PlayerHarness src="/v1.mp4" contentId="c1" courseId="course-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('resume').textContent).toBe('45');
    });

    const media = getMedia();
    setMediaState(media, { duration: 120 });
    fireEvent(media, new Event('loadedmetadata'));

    expect(screen.getByTestId('status').textContent).toBe('ready');
    expect(media.currentTime).toBe(45);
  });

  it('does not resume when the saved position is near the end', async () => {
    mockFetchMediaProgress.mockResolvedValue({
      contentId: 'c1',
      currentTime: 118,
      duration: 120,
      progress: 98,
      completed: false,
      updatedAt: '2026-01-01T00:00:00.000Z'
    });

    render(<PlayerHarness src="/v1.mp4" contentId="c1" />);

    const media = getMedia();
    setMediaState(media, { duration: 120 });
    fireEvent(media, new Event('loadedmetadata'));

    expect(media.currentTime).toBe(0);
  });

  it('tracks playback progress as the media plays', async () => {
    render(<PlayerHarness src="/v1.mp4" contentId="c1" />);

    const media = getMedia();
    setMediaState(media, { duration: 100 });
    fireEvent(media, new Event('loadedmetadata'));
    fireEvent(media, new Event('play'));

    expect(screen.getByTestId('status').textContent).toBe('playing');

    media.currentTime = 50;
    fireEvent(media, new Event('timeupdate'));

    expect(screen.getByTestId('currentTime').textContent).toBe('50');
    expect(screen.getByTestId('progress').textContent).toBe('50');
  });

  it('saves progress when the media is paused', async () => {
    render(<PlayerHarness src="/v1.mp4" contentId="c1" />);

    const media = getMedia();
    setMediaState(media, { duration: 100 });
    fireEvent(media, new Event('loadedmetadata'));
    fireEvent(media, new Event('play'));
    media.currentTime = 60;
    fireEvent(media, new Event('timeupdate'));
    fireEvent(media, new Event('pause'));

    await waitFor(() => {
      expect(mockSaveMediaProgress).toHaveBeenCalledWith(
        expect.objectContaining({ contentId: 'c1', currentTime: 60, duration: 100 })
      );
      expect(screen.getByTestId('saveStatus').textContent).toBe('saved');
    });
  });

  it('saves progress when the media ends', async () => {
    render(<PlayerHarness src="/v1.mp4" contentId="c1" />);

    const media = getMedia();
    setMediaState(media, { duration: 100 });
    fireEvent(media, new Event('loadedmetadata'));
    media.currentTime = 100;
    fireEvent(media, new Event('ended'));

    await waitFor(() => {
      expect(screen.getByTestId('progress').textContent).toBe('100');
      expect(mockSaveMediaProgress).toHaveBeenCalledWith(
        expect.objectContaining({ contentId: 'c1', currentTime: 100, duration: 100 })
      );
    });
  });

  it('saves the current position on seek and via saveNow', async () => {
    render(<PlayerHarness src="/v1.mp4" contentId="c1" />);

    const media = getMedia();
    setMediaState(media, { duration: 100 });
    fireEvent(media, new Event('loadedmetadata'));

    fireEvent.click(screen.getByText('seek'));
    expect(media.currentTime).toBe(42);

    media.currentTime = 70;
    fireEvent.click(screen.getByText('save-now'));

    // The seek's save may still be in flight; the newer position is
    // coalesced and persisted afterwards.
    await waitFor(() => {
      expect(mockSaveMediaProgress).toHaveBeenCalledWith(expect.objectContaining({ currentTime: 70 }));
    });
  });

  it('surfaces media errors with a retry that reloads the source', async () => {
    render(<PlayerHarness src="/v1.mp4" contentId="c1" />);

    const media = getMedia();
    setMediaState(media, { duration: 100, readyState: 2 });
    fireEvent(media, new Event('loadedmetadata'));
    fireEvent(media, new Event('error'));

    expect(screen.getByTestId('status').textContent).toBe('error');
    expect(screen.getByTestId('error').textContent).toContain('Unable to load this media');

    const loadSpy = jest.spyOn(media, 'load').mockImplementation(() => undefined);
    fireEvent.click(screen.getByText('retry'));
    expect(loadSpy).toHaveBeenCalled();
    expect(screen.getByTestId('status').textContent).toBe('loading');
  });

  it('marks saves as offline when the backend rejects them', async () => {
    mockSaveMediaProgress.mockResolvedValue({ saved: false, queued: true, progress: {} });

    render(<PlayerHarness src="/v1.mp4" contentId="c1" />);

    const media = getMedia();
    setMediaState(media, { duration: 100 });
    fireEvent(media, new Event('loadedmetadata'));
    fireEvent(media, new Event('play'));
    media.currentTime = 30;
    fireEvent(media, new Event('timeupdate'));
    fireEvent(media, new Event('pause'));

    await screen.findByText('offline');
  });
});
