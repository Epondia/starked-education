'use client';

import { useTheme as useNextTheme } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

/** The localStorage key used across both routers. */
export const THEME_STORAGE_KEY = 'starked-theme';

const THEME_CYCLE: ThemeMode[] = ['light', 'dark', 'system'];

// ─── Reduced-motion helper ────────────────────────────────────────────────────

/**
 * Returns `true` when the user has requested reduced motion via OS settings
 * OR when AccessibilityProvider has added `.reduce-motion` on `<html>`.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const check = () =>
      setReduced(
        mql.matches ||
          document.documentElement.classList.contains('reduce-motion')
      );
    check();
    mql.addEventListener('change', check);
    return () => mql.removeEventListener('change', check);
  }, []);

  return reduced;
}

// ─── Screen-reader announcement ───────────────────────────────────────────────

function announceThemeChange(message: string): void {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  // sr-only class is defined in styles/globals.css
  el.className = 'sr-only';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    if (document.body.contains(el)) document.body.removeChild(el);
  }, 1500);
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface UseThemeReturn {
  /** The stored theme key — may be `'system'`. */
  theme: ThemeMode;
  /** The visually applied theme — always `'light'` or `'dark'`. */
  resolvedTheme: 'light' | 'dark';
  /** `true` when OS or AccessibilityProvider requests reduced motion. */
  prefersReducedMotion: boolean;
  /** Advance one step: Light → Dark → System → Light. */
  cycleTheme: () => void;
  /** Jump directly to a specific theme. */
  setTheme: (theme: ThemeMode) => void;
}

/**
 * useTheme
 *
 * Thin wrapper around `next-themes` that:
 *  - Persists choice under `starked-theme` in localStorage.
 *  - Cycles Light → Dark → System on each `cycleTheme()` call.
 *  - Announces changes to screen readers via a polite live region.
 *  - Exposes `prefersReducedMotion` so callers can skip animations.
 */
export function useTheme(): UseThemeReturn {
  const {
    theme,
    setTheme: setNextTheme,
    resolvedTheme,
  } = useNextTheme();

  const prefersReducedMotion = usePrefersReducedMotion();
  const currentMode: ThemeMode = (theme as ThemeMode) ?? 'system';

  const setTheme = useCallback(
    (next: ThemeMode) => {
      setNextTheme(next);
      // next-themes already writes to localStorage, but under its own key.
      // Mirror to `starked-theme` so both routers share the same key.
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Private browsing / storage disabled — silently ignore.
      }
      const labels: Record<ThemeMode, string> = {
        light: 'light',
        dark: 'dark',
        system: 'system (follows OS)',
      };
      announceThemeChange(`Theme changed to ${labels[next]}`);
    },
    [setNextTheme]
  );

  const cycleTheme = useCallback(() => {
    const idx = THEME_CYCLE.indexOf(currentMode);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  }, [currentMode, setTheme]);

  return {
    theme: currentMode,
    resolvedTheme: (resolvedTheme as 'light' | 'dark') ?? 'light',
    prefersReducedMotion,
    cycleTheme,
    setTheme,
  };
}
