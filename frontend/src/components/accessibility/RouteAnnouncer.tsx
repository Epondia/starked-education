'use client';

/**
 * Client-side route-change announcer for the Next.js App Router.
 *
 * Next.js's Pages Router gets its `<a class="skip-link">` and `<div role="status"
 * aria-live="polite">` from `pages/_app.tsx`. The App Router has no equivalent, so
 * this component mirrors that behaviour for any path inside `app/*`:
 *
 *   - It renders an `sr-only` status region whose content updates whenever
 *     `usePathname()` returns a new value.
 *   - Updates are wrapped in a `requestAnimationFrame` so successive navigations
 *     within the same tick always trigger a DOM mutation (browsers coalesce
 *     identical aria-live updates, which would otherwise leave a screen reader
 *     silent).
 *
 * Place this component once near the top of `app/layout.tsx`. Do not add a second
 * announcer without re-reading `pages/_app.tsx`'s NOTE about the landmark /
 * announcer split between the two routers.
 */
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const RouteAnnouncer = () => {
  const pathname = usePathname() ?? '/';
  // Track the last announced path so identical successive navigations still fire
  // (Next.js sometimes repeats the pathname during fast-refresh).
  const [announcedPath, setAnnouncedPath] = useState<string | null>(null);

  useEffect(() => {
    if (announcedPath === pathname) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setAnnouncedPath(pathname);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, announcedPath]);

  // Friendly, deterministic human label: avoid shouting the raw URL at the user.
  const humanize = (raw: string): string => {
    if (!raw || raw === '/') return 'home';
    const segments = raw.split('/').filter(Boolean);
    if (segments.length === 0) return 'home';
    return segments
      .map((segment) => {
        // Replace dashes/underscores with spaces and capitalise the first letter.
        const readable = segment.replace(/[-_]+/g, ' ');
        return readable.charAt(0).toUpperCase() + readable.slice(1);
      })
      .join(' – ');
  };

  return (
    <div
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="route-announcer"
    >
      {announcedPath !== null ? `Navigated to ${humanize(announcedPath)}` : ''}
    </div>
  );
};

export default RouteAnnouncer;
