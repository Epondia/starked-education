import { renderHook, act } from '@testing-library/react';
import { useNetworkStatus } from '../useNetworkStatus';

describe('useNetworkStatus', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports the browser online state on mount', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it('reports offline when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);
  });

  it('updates when offline/online window events fire', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOnline).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.isOnline).toBe(true);
  });

  it('removes window listeners on unmount', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useNetworkStatus());
    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
