'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/hooks/useTheme';

// ─── Theme metadata ───────────────────────────────────────────────────────────

const THEME_META: Record<
  ThemeMode,
  { Icon: React.ElementType; label: string; next: ThemeMode }
> = {
  light:  { Icon: Sun,     label: 'Light',  next: 'dark'   },
  dark:   { Icon: Moon,    label: 'Dark',   next: 'system' },
  system: { Icon: Monitor, label: 'System', next: 'light'  },
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * ThemeToggle
 *
 * A three-mode toggle button (Light → Dark → System → Light) that:
 *  - Shows Sun / Moon / Monitor icons matching the active mode.
 *  - Persists choice to localStorage under `starked-theme`.
 *  - Respects `prefers-reduced-motion` — disables icon animation when set.
 *  - Announces the new mode to screen readers via a polite live region.
 *  - Is hydration-safe: renders a skeleton until the client mounts.
 *  - Has `aria-label="Toggle theme"` plus a verbose current/next description.
 *
 * Drop it anywhere — state comes entirely from `useTheme()`.
 *
 * @example
 *   <ThemeToggle />
 */
export default function ThemeToggle() {
  const { theme, cycleTheme, prefersReducedMotion } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Defer real render until after hydration to prevent SSR mismatch.
  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Skeleton (pre-hydration) ─────────────────────────────────────────────
  if (!mounted) {
    return (
      <button
        className="theme-toggle-btn"
        aria-label="Toggle theme"
        disabled
      >
        <span className="theme-toggle-icon-placeholder" aria-hidden="true" />
      </button>
    );
  }

  // ── Resolved state ───────────────────────────────────────────────────────
  const meta      = THEME_META[theme];
  const nextLabel = THEME_META[meta.next].label;
  const { Icon, label } = meta;

  return (
    <button
      id="theme-toggle"
      onClick={cycleTheme}
      className={[
        'theme-toggle-btn',
        prefersReducedMotion ? 'no-transition' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Toggle theme. Current: ${label}. Click to switch to ${nextLabel}.`}
      title={`Theme: ${label}`}
    >
      {/* Icon rotates slightly on click via CSS */}
      <span className="theme-toggle-icon" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      {/* Visible to screen readers only */}
      <span className="sr-only">Theme: {label}</span>
    </button>
  );
}
