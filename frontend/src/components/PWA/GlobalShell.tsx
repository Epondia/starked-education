'use client';

/**
 * GlobalShell — client-side wrapper that mounts the persistent PWA chrome
 * (install banner, offline indicator, update banner) plus a fixed-position
 * LanguageSwitcher and ThemeToggle so they are available on every page
 * WITHOUT stacking on top of any in-page `<header>` elements that pages
 * may already render.
 *
 * Mounted from both the pages router (`_app.tsx`) and the app router
 * (`app/layout.tsx`).
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { LanguageSwitcher } from '../LanguageSwitcher';

// GlobalPWA uses hooks that depend on `window`, so load it dynamically and
// disable SSR to avoid hydration mismatches.
const GlobalPWA = dynamic(
  () => import('./GlobalPWA').then((m) => m.GlobalPWA),
  {
    ssr: false,
  }
);

// ThemeToggle reads localStorage and matchMedia — must be client-only.
const ThemeToggle = dynamic(() => import('../ui/ThemeToggle'), { ssr: false });

export const GlobalShell: React.FC = () => {
  return (
    <>
      <GlobalPWA />
      {/* Fixed top-right strip: ThemeToggle + LanguageSwitcher.
          gap-2 keeps them from overlapping; z-40 sits above most content. */}
      <div
        className="fixed top-2 right-2 z-40 flex items-center gap-2"
        style={{ pointerEvents: 'auto' }}
        role="region"
        aria-label="Page controls"
      >
        <ThemeToggle />
        <LanguageSwitcher variant="compact" />
      </div>
    </>
  );
};

export default GlobalShell;
