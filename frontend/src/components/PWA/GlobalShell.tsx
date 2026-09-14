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

// GlobalSearch is client-only (uses window, debounce, API calls)
const GlobalSearch = dynamic(() => import('../GlobalSearch').then((m) => m.GlobalSearch), { ssr: false });
// LanguageSwitcher pulls in the entire i18n chain (i18next, react-i18next,
// browser-only backends). Loading it with ssr:false prevents SSR crashes
// caused by browser APIs (document, localStorage) referenced at module level.
const LanguageSwitcher = dynamic(
  () => import('../LanguageSwitcher').then((m) => m.LanguageSwitcher),
  { ssr: false }
);

export const GlobalShell: React.FC = () => {
  return (
    <>
      <GlobalPWA />
      {/* Fixed top strip: GlobalSearch (left) + ThemeToggle + LanguageSwitcher (right).
          z-40 sits above most content. */}
      <div
        className="fixed top-2 left-2 right-2 z-40 flex items-center justify-between gap-2"
        style={{ pointerEvents: 'auto' }}
        role="region"
        aria-label="Page controls"
      >
        <div className="flex items-center gap-2">
          <GlobalSearch />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher variant="compact" />
        </div>
      </div>
    </>
  );
};

export default GlobalShell;
