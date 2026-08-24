import { renderHook, act } from '@testing-library/react';
import { useVirtualList } from '../useVirtualList';

const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));

describe('useVirtualList', () => {
  it('renders only the visible window plus overscan', () => {
    const { result } = renderHook(() =>
      useVirtualList({ items, itemHeight: 100, containerHeight: 500, overscan: 3 }),
    );

    expect(result.current.totalHeight).toBe(10000);
    // scrollTop 0: visible 0..4 (ceil(500/100) = 5) + 3 overscan below
    expect(result.current.virtualItems.length).toBe(9);
    expect(result.current.virtualItems[0]).toMatchObject({ index: 0, offsetTop: 0 });
    expect(result.current.virtualItems[8]).toMatchObject({ index: 8, offsetTop: 800 });
  });

  it('clamps the window to the item count', () => {
    const { result } = renderHook(() =>
      useVirtualList({ items, itemHeight: 100, containerHeight: 20000, overscan: 0 }),
    );

    // Viewport is larger than the list, so the window clamps to all items.
    expect(result.current.virtualItems).toHaveLength(100);
    expect(result.current.virtualItems[99]).toMatchObject({
      index: 99,
      offsetTop: 9900,
    });
  });

  it('updates the visible window when the container scrolls', () => {
    const { result } = renderHook(() =>
      useVirtualList({ items, itemHeight: 100, containerHeight: 500 }),
    );

    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: 1000 });
    act(() => {
      result.current.containerRef(el);
    });
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });

    // scrollTop 1000: start = 1000/100 - 3 overscan = 7
    expect(result.current.virtualItems[0].index).toBe(7);
    expect(result.current.virtualItems[0].offsetTop).toBe(700);
  });

  it('attaches and detaches the scroll listener', () => {
    const { result, unmount } = renderHook(() =>
      useVirtualList({ items, itemHeight: 100, containerHeight: 500 }),
    );

    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: 0 });
    const addSpy = jest.spyOn(el, 'addEventListener');
    const removeSpy = jest.spyOn(el, 'removeEventListener');

    act(() => {
      result.current.containerRef(el);
    });
    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('scrollToIndex scrolls the container to the item offset', () => {
    const { result } = renderHook(() =>
      useVirtualList({ items, itemHeight: 100, containerHeight: 500 }),
    );

    const el = document.createElement('div');
    el.scrollTo = jest.fn();
    act(() => {
      result.current.containerRef(el);
    });

    act(() => {
      result.current.scrollToIndex(50);
    });
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 5000, behavior: 'smooth' });

    act(() => {
      result.current.scrollToIndex(10, 'auto');
    });
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'auto' });
  });
});
