import { renderHook, act } from '@testing-library/react';
import { useTheme, THEME_STORAGE_KEY } from '../useTheme';
import { useTheme as useNextTheme } from 'next-themes';

jest.mock('next-themes', () => ({
  useTheme: jest.fn(),
}));

const mockUseNextTheme = useNextTheme as jest.Mock;

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    jest.useFakeTimers();
    mockUseNextTheme.mockReturnValue({
      theme: 'light',
      setTheme: jest.fn(),
      resolvedTheme: 'light',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('returns the current theme, resolved theme, and reduced-motion preference', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
    expect(result.current.prefersReducedMotion).toBe(false);
  });

  it('defaults to system when next-themes reports no stored theme', () => {
    mockUseNextTheme.mockReturnValue({
      theme: null,
      setTheme: jest.fn(),
      resolvedTheme: 'dark',
    });

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('setTheme delegates to next-themes and mirrors the choice to localStorage', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(mockUseNextTheme().setTheme).toHaveBeenCalledWith('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('announces theme changes to screen readers via a polite live region', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    const liveRegion = document.body.querySelector('[role="status"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.textContent).toContain('Theme changed to dark');
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');

    // The announcement removes itself after 1.5s.
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(document.body.querySelector('[role="status"]')).toBeNull();
  });

  it('cycles light → dark → system → light', () => {
    const { result, rerender } = renderHook(() => useTheme());

    // next-themes reports the theme; cycleTheme advances from the reported
    // theme, so each step re-renders with the updated theme.
    act(() => result.current.cycleTheme());
    expect(mockUseNextTheme().setTheme).toHaveBeenLastCalledWith('dark');

    mockUseNextTheme.mockReturnValue({ theme: 'dark', setTheme: jest.fn(), resolvedTheme: 'dark' });
    rerender();
    act(() => result.current.cycleTheme());
    expect(mockUseNextTheme().setTheme).toHaveBeenLastCalledWith('system');

    mockUseNextTheme.mockReturnValue({ theme: 'system', setTheme: jest.fn(), resolvedTheme: 'dark' });
    rerender();
    act(() => result.current.cycleTheme());
    expect(mockUseNextTheme().setTheme).toHaveBeenLastCalledWith('light');
  });

  it('setTheme tolerates storage failures without throwing', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { result } = renderHook(() => useTheme());

    expect(() => {
      act(() => result.current.setTheme('dark'));
    }).not.toThrow();

    expect(mockUseNextTheme().setTheme).toHaveBeenCalledWith('dark');
    jest.restoreAllMocks();
  });
});
