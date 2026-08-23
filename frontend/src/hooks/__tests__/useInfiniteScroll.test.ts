import { renderHook, act } from '@testing-library/react';
import { useInfiniteScroll } from '../useInfiniteScroll';

// Minimal IntersectionObserver stub so the hook can be exercised without a
// browser. Instances record observed nodes and expose a trigger() helper.
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observed: Element[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(node: Element) {
    this.observed.push(node);
  }

  unobserve() {}
  disconnect() {
    this.observed = [];
  }
  takeRecords() {
    return [];
  }

  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting, target: this.observed[0] } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

(globalThis as { IntersectionObserver: unknown }).IntersectionObserver =
  MockIntersectionObserver;

describe('useInfiniteScroll', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
  });

  it('observes the sentinel element when more items exist', () => {
    const onLoadMore = jest.fn();
    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, hasMore: true, isLoading: false }),
    );

    const sentinel = document.createElement('div');
    act(() => {
      result.current.sentinelRef(sentinel);
    });

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    expect(MockIntersectionObserver.instances[0].observed).toContain(sentinel);
  });

  it('calls onLoadMore when the sentinel becomes visible', () => {
    const onLoadMore = jest.fn();
    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, hasMore: true, isLoading: false }),
    );

    const sentinel = document.createElement('div');
    act(() => {
      result.current.sentinelRef(sentinel);
    });

    act(() => {
      MockIntersectionObserver.instances[0].trigger(true);
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not call onLoadMore while a fetch is in flight', () => {
    const onLoadMore = jest.fn();
    const { result, rerender } = renderHook(
      ({ isLoading }) =>
        useInfiniteScroll({ onLoadMore, hasMore: true, isLoading }),
      { initialProps: { isLoading: false } },
    );

    const sentinel = document.createElement('div');
    act(() => {
      result.current.sentinelRef(sentinel);
    });

    rerender({ isLoading: true });
    // The hook re-observes with a fresh callback when isLoading flips, so
    // the latest observer instance carries the up-to-date guard.
    const latest = MockIntersectionObserver.instances[
      MockIntersectionObserver.instances.length - 1
    ];
    act(() => {
      latest.trigger(true);
    });

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does not observe the sentinel when there is nothing more to load', () => {
    const onLoadMore = jest.fn();
    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, hasMore: false, isLoading: false }),
    );

    const sentinel = document.createElement('div');
    act(() => {
      result.current.sentinelRef(sentinel);
    });

    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });

  it('does not call onLoadMore when the sentinel is not intersecting', () => {
    const onLoadMore = jest.fn();
    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, hasMore: true, isLoading: false }),
    );

    const sentinel = document.createElement('div');
    act(() => {
      result.current.sentinelRef(sentinel);
    });

    act(() => {
      MockIntersectionObserver.instances[0].trigger(false);
    });

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('re-observes the sentinel when hasMore flips back to true', () => {
    const onLoadMore = jest.fn();
    const { result, rerender } = renderHook(
      ({ hasMore }) =>
        useInfiniteScroll({ onLoadMore, hasMore, isLoading: false }),
      { initialProps: { hasMore: true } },
    );

    const sentinel = document.createElement('div');
    act(() => {
      result.current.sentinelRef(sentinel);
    });

    rerender({ hasMore: false });
    rerender({ hasMore: true });

    // Re-observation after hasMore flips should create a fresh observer.
    expect(MockIntersectionObserver.instances.length).toBeGreaterThan(1);
    act(() => {
      MockIntersectionObserver.instances[
        MockIntersectionObserver.instances.length - 1
      ].trigger(true);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('disconnects the observer on unmount', () => {
    const disconnectSpy = jest.spyOn(
      MockIntersectionObserver.prototype,
      'disconnect',
    );
    const onLoadMore = jest.fn();
    const { result, unmount } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, hasMore: true, isLoading: false }),
    );

    act(() => {
      result.current.sentinelRef(document.createElement('div'));
    });

    unmount();
    expect(disconnectSpy).toHaveBeenCalled();
    disconnectSpy.mockRestore();
  });
});
