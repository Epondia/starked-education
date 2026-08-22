import { renderHook, act } from '@testing-library/react';
import { useDebouncedSearch, useDebouncedCallback } from '../useDebouncedSearch';

describe('useDebouncedSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value immediately on first render', () => {
    const { result } = renderHook(() => useDebouncedSearch('initial'));
    expect(result.current).toBe('initial');
  });

  it('keeps the previous value until the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedSearch(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    expect(result.current).toBe('a');

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe('ab');
  });

  it('resets the timer when the value changes rapidly', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedSearch(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    act(() => jest.advanceTimersByTime(200));

    rerender({ value: 'abc' });
    act(() => jest.advanceTimersByTime(200));
    expect(result.current).toBe('a');

    act(() => jest.advanceTimersByTime(100));
    expect(result.current).toBe('abc');
  });

  it('does not update state after unmount', () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useDebouncedSearch(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    unmount();

    // Advancing past the delay must not throw or warn about state updates
    // on an unmounted component.
    expect(() => {
      act(() => jest.advanceTimersByTime(300));
    }).not.toThrow();
    expect(result.current).toBe('a');
  });
});

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defers invoking the callback until the delay elapses', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 300));

    act(() => {
      result.current('hello');
    });
    expect(fn).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('hello');
  });

  it('cancels the pending call when invoked again', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 300));

    act(() => result.current(1));
    act(() => jest.advanceTimersByTime(200));
    act(() => result.current(2));
    act(() => jest.advanceTimersByTime(200));
    expect(fn).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(100));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
  });

  it('keeps a stable reference across renders', () => {
    const fn = jest.fn();
    const { result, rerender } = renderHook(() => useDebouncedCallback(fn, 300));

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
