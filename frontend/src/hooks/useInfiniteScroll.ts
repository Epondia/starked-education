'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseInfiniteScrollOptions {
  /**
   * Called when the sentinel element is visible — load the next page here.
   */
  onLoadMore: () => void;
  /**
   * Whether there are more items to load. When false the observer is removed.
   */
  hasMore: boolean;
  /**
   * Whether a fetch is currently in flight. Prevents duplicate calls.
   */
  isLoading: boolean;
  /**
   * IntersectionObserver threshold (0‑1). Default: 0.1
   */
  threshold?: number;
  /**
   * IntersectionObserver rootMargin. Default: '200px' (pre-load before the
   * sentinel enters the viewport).
   */
  rootMargin?: string;
  /**
   * Root element. Defaults to the viewport.
   */
  root?: Element | null;
}

export interface UseInfiniteScrollReturn {
  /**
   * Attach this ref to the sentinel element placed at the bottom of the list.
   */
  sentinelRef: React.RefCallback<Element>;
}

/**
 * Triggers `onLoadMore` when the sentinel element scrolls into view.
 *
 * Usage:
 * ```tsx
 * const { sentinelRef } = useInfiniteScroll({ onLoadMore, hasMore, isLoading });
 * return (
 *   <>
 *     {items.map(...)}
 *     <div ref={sentinelRef} />
 *   </>
 * );
 * ```
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 0.1,
  rootMargin = '200px',
  root = null,
}: UseInfiniteScrollOptions): UseInfiniteScrollReturn {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<Element | null>(null);

  // Stable callback so we don't re-create the observer on every render
  const stableOnLoadMore = useRef(onLoadMore);
  useEffect(() => { stableOnLoadMore.current = onLoadMore; }, [onLoadMore]);

  const observe = useCallback(
    (node: Element | null) => {
      // Disconnect any previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node || !hasMore) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting && !isLoading) {
            stableOnLoadMore.current();
          }
        },
        { root, rootMargin, threshold },
      );

      observer.observe(node);
      observerRef.current = observer;
      sentinelNodeRef.current = node;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasMore, isLoading, root, rootMargin, threshold],
  );

  // When hasMore or isLoading changes, re-evaluate whether to observe
  useEffect(() => {
    if (!sentinelNodeRef.current) return;
    observe(sentinelNodeRef.current);
  }, [observe]);

  // Clean up on unmount
  useEffect(
    () => () => {
      observerRef.current?.disconnect();
    },
    [],
  );

  return { sentinelRef: observe };
}

export default useInfiniteScroll;
