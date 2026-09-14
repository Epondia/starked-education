'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useDebouncedSearch(value, delay)
 *
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * inactivity. This is the canonical hook for "wait until the user stops typing"
 * behaviour — used by the discovery SearchBar (issue #112) so we don't fire
 * one fetch per keystroke.
 *
 * The hook always returns the *input value* synchronously on the first render
 * to avoid layout shift / placeholder flashes, then settles to the debounced
 * value. Callers can safely pass the returned value to React state without
 * causing re-render storms.
 */
export function useDebouncedSearch<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      // First render: show the input value immediately so the user sees what
      // they typed without a flash of empty content.
      mountedRef.current = true;
      setDebouncedValue(value);
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, Math.max(0, delay));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delay]);

  // Cancel any pending update on unmount.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return debouncedValue;
}

/**
 * useDebouncedCallback(fn, delay)
 *
 * Returns a stable wrapper that defers calling `fn` until `delay` ms have
 * elapsed since the last call. Unlike useDebouncedSearch, this is for "fire
 * a side effect on idle" rather than mirroring a value into state.
 *
 * The wrapper keeps a stable reference across renders so consumers can put it
 * in a `useEffect` dependency list without triggering constant re-subscribes.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay = 300,
): (...args: TArgs) => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return useCallback(
    (...args: TArgs) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fnRef.current(...args);
      }, Math.max(0, delay));
    },
    [delay],
  );
}

export default useDebouncedSearch;
