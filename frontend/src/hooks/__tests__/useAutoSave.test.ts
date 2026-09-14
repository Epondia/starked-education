import { renderHook, act, waitFor } from '@testing-library/react';
import { useAutoSave } from '../useAutoSave';

describe('useAutoSave', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial content and a clean default status', () => {
    const { result } = renderHook(() => useAutoSave('hello'));

    expect(result.current.content).toBe('hello');
    expect(result.current.status).toMatchObject({
      isSaving: false,
      lastSaved: null,
      saveCount: 0,
      lastError: null,
      isDirty: false,
    });
  });

  it('marks content as dirty when updated', () => {
    const { result } = renderHook(() => useAutoSave('hello'));

    act(() => result.current.setContent('hello world'));
    expect(result.current.status.isDirty).toBe(true);
  });

  it('leaves content clean when set to the same value', () => {
    const { result } = renderHook(() => useAutoSave('hello'));

    act(() => result.current.setContent('hello'));
    expect(result.current.status.isDirty).toBe(false);
  });

  it('saveNow persists the content and clears the dirty flag', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave('hello', { onSave }));

    act(() => result.current.setContent('updated'));
    act(() => result.current.saveNow());

    await waitFor(() => {
      expect(result.current.status.lastSaved).toBeInstanceOf(Date);
    });

    expect(onSave).toHaveBeenCalledWith('updated');
    expect(result.current.status.isDirty).toBe(false);
    expect(result.current.status.saveCount).toBeGreaterThan(0);
  });

  it('forceSave saves even when the content is unchanged', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave('hello', { onSave }));

    act(() => result.current.forceSave());

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('hello');
    });
  });

  it('auto-saves dirty content on the configured interval', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoSave('hello', { interval: 1000, debounceMs: 0, onSave }),
    );

    act(() => result.current.setContent('updated'));
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1005);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('updated');
    });
  });

  it('records save failures and retries with exponential backoff', async () => {
    const onError = jest.fn();
    const onSave = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoSave('hello', { debounceMs: 0, maxRetries: 2, onSave, onError }),
    );

    act(() => result.current.forceSave());

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
    expect(result.current.status.lastError).toEqual(expect.any(Error));
    expect(result.current.status.isDirty).toBe(true);

    // Retry #1 is scheduled with 2^0 * 1000ms backoff.
    await act(async () => {
      jest.advanceTimersByTime(1005);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(2);
    });
    expect(result.current.status.lastError).toBeNull();
  });

  it('stops retrying after maxRetries is exhausted', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('always fails'));
    const { result } = renderHook(() =>
      useAutoSave('hello', { debounceMs: 0, maxRetries: 1, onSave }),
    );

    act(() => result.current.forceSave());

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1); // initial attempt fails
    });

    // Single retry fires after the first backoff window.
    await act(async () => {
      jest.advanceTimersByTime(1005);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(2); // initial + 1 retry
    });

    // No further retries should be scheduled.
    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('resetStatus clears save state and retry counters', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave('hello', { onSave }));

    act(() => result.current.setContent('dirty'));
    act(() => result.current.saveNow());

    await waitFor(() => {
      expect(result.current.status.saveCount).toBeGreaterThan(0);
    });

    act(() => result.current.resetStatus());
    expect(result.current.status).toMatchObject({
      isSaving: false,
      lastSaved: null,
      saveCount: 0,
      lastError: null,
      isDirty: false,
    });
  });
});
