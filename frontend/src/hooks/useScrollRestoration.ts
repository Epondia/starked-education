'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const SESSION_STORAGE_KEY = 'scroll_positions';

function readPositions(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writePosition(key: string, value: number) {
  if (typeof window === 'undefined') return;
  try {
    const positions = readPositions();
    positions[key] = value;
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // sessionStorage not available (private browsing, storage quota, etc.)
  }
}

export interface UseScrollRestorationOptions {
  /**
   * Unique key that identifies the scroll container. Defaults to the current
   * pathname so navigating back automatically restores position.
   */
  key?: string;
  /**
   * Whether to disable scroll restoration (e.g., during a fresh search).
   * Default: false.
   */
  disabled?: boolean;
}

export interface UseScrollRestorationReturn {
  /** Attach to the scrollable container element. */
  containerRef: React.RefCallback<HTMLElement>;
  /** Manually save the current scroll position (called automatically on scroll). */
  savePosition: () => void;
  /** Restore the saved position. Called automatically on mount. */
  restorePosition: () => void;
  /** Delete the stored position for this key (e.g., after a new search). */
  clearPosition: () => void;
}

/**
 * Persists and restores a container's scroll position across page navigations
 * using `sessionStorage`.
 *
 * Usage:
 * ```tsx
 * const { containerRef } = useScrollRestoration({ key: 'course-listing' });
 * return <div ref={containerRef} style={{ overflowY: 'auto' }}>…</div>;
 * ```
 */
export function useScrollRestoration({
  key,
  disabled = false,
}: UseScrollRestorationOptions = {}): UseScrollRestorationReturn {
  const pathname = usePathname();
  const storageKey = key ?? pathname ?? 'default';
  const containerNodeRef = useRef<HTMLElement | null>(null);
  const restoredRef = useRef(false);

  const savePosition = useCallback(() => {
    if (disabled) return;
    const node = containerNodeRef.current;
    if (!node) return;
    writePosition(storageKey, node.scrollTop);
  }, [disabled, storageKey]);

  const restorePosition = useCallback(() => {
    if (disabled) return;
    const node = containerNodeRef.current;
    if (!node) return;
    const saved = readPositions()[storageKey];
    if (saved !== undefined) {
      node.scrollTop = saved;
    }
  }, [disabled, storageKey]);

  const clearPosition = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const positions = readPositions();
      delete positions[storageKey];
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(positions));
    } catch {
      //
    }
  }, [storageKey]);

  const handleScroll = useCallback(() => {
    savePosition();
  }, [savePosition]);

  const attachContainer = useCallback(
    (node: HTMLElement | null) => {
      // Detach old listeners
      if (containerNodeRef.current) {
        containerNodeRef.current.removeEventListener('scroll', handleScroll);
      }
      containerNodeRef.current = node;
      if (node) {
        node.addEventListener('scroll', handleScroll, { passive: true });
        // Restore on first attach only
        if (!restoredRef.current) {
          restoredRef.current = true;
          // Delay slightly so the list has rendered before scrolling
          requestAnimationFrame(() => restorePosition());
        }
      }
    },
    [handleScroll, restorePosition],
  );

  // When the key changes (e.g., new search) reset restored flag
  useEffect(() => {
    restoredRef.current = false;
  }, [storageKey]);

  // Save on unmount/navigation
  useEffect(
    () => () => {
      savePosition();
      containerNodeRef.current?.removeEventListener('scroll', handleScroll);
    },
    [handleScroll, savePosition],
  );

  return {
    containerRef: attachContainer,
    savePosition,
    restorePosition,
    clearPosition,
  };
}

export default useScrollRestoration;
