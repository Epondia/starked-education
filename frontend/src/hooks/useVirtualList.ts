'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface VirtualListOptions<T> {
  items: T[];
  /**
   * Height of each item in pixels. For variable-height items use
   * `estimatedItemHeight` and let the hook measure them.
   */
  itemHeight: number;
  /**
   * Height of the scroll container in pixels.
   */
  containerHeight: number;
  /**
   * Number of extra items to render above/below the visible area.
   * Higher values reduce blank flashes during fast scrolls at the cost of
   * more DOM nodes. Default: 3.
   */
  overscan?: number;
}

export interface VirtualListReturn<T> {
  /** Items that should currently be rendered. */
  virtualItems: Array<{ item: T; index: number; offsetTop: number }>;
  /** Total height of the inner scroll container. */
  totalHeight: number;
  /** Attach to the scroll container element. */
  containerRef: React.RefCallback<HTMLElement>;
  /** Programmatically scroll to an item by index. */
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
}

/**
 * Windowed/virtual list hook — only renders the slice of items currently
 * visible in the scroll container plus an `overscan` buffer.
 *
 * Reduces DOM nodes for large datasets, improving render performance.
 *
 * Usage:
 * ```tsx
 * const { virtualItems, totalHeight, containerRef } = useVirtualList({
 *   items,
 *   itemHeight: 200,
 *   containerHeight: 800,
 * });
 *
 * return (
 *   <div ref={containerRef} style={{ height: containerHeight, overflowY: 'auto' }}>
 *     <div style={{ height: totalHeight, position: 'relative' }}>
 *       {virtualItems.map(({ item, index, offsetTop }) => (
 *         <div key={index} style={{ position: 'absolute', top: offsetTop, width: '100%' }}>
 *           <CourseCard course={item} />
 *         </div>
 *       ))}
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useVirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 3,
}: VirtualListOptions<T>): VirtualListReturn<T> {
  const [scrollTop, setScrollTop] = useState(0);
  const containerNodeRef = useRef<HTMLElement | null>(null);

  const handleScroll = useCallback((e: Event) => {
    setScrollTop((e.target as HTMLElement).scrollTop);
  }, []);

  const attachContainer = useCallback(
    (node: HTMLElement | null) => {
      if (containerNodeRef.current) {
        containerNodeRef.current.removeEventListener('scroll', handleScroll);
      }
      containerNodeRef.current = node;
      if (node) {
        node.addEventListener('scroll', handleScroll, { passive: true });
        setScrollTop(node.scrollTop);
      }
    },
    [handleScroll],
  );

  useEffect(
    () => () => {
      containerNodeRef.current?.removeEventListener('scroll', handleScroll);
    },
    [handleScroll],
  );

  const totalHeight = items.length * itemHeight;

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
  );

  const virtualItems = [];
  for (let i = startIndex; i <= endIndex; i++) {
    virtualItems.push({
      item: items[i],
      index: i,
      offsetTop: i * itemHeight,
    });
  }

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const node = containerNodeRef.current;
      if (!node) return;
      node.scrollTo({ top: index * itemHeight, behavior });
    },
    [itemHeight],
  );

  return {
    virtualItems,
    totalHeight,
    containerRef: attachContainer,
    scrollToIndex,
  };
}

export default useVirtualList;
