import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { performanceMonitor } from '@/lib/performance-monitor';
import RouteAnnouncer from '@/components/accessibility/RouteAnnouncer';
import SiteFooter from '@/components/accessibility/SiteFooter';
import SiteHeader from '@/components/accessibility/SiteHeader';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'StarkEd Education - Decentralized Learning Platform',
  description: 'Learn blockchain development with courses powered by Stellar',
};

// RTL locales
const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

export default function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params?: { locale?: string };
}) {
  const locale = params?.locale ?? 'en';
  const dir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body className={inter.className}>
        {/*
          Skip-link MUST be the first focusable element so the first Tab stops at
          "Skip to main content" before any nav/menu. See issue #70 DoD:
          "ARIA landmarks on all pages (main, nav, banner, contentinfo)".
        */}
        <a
          href="#main-content"
          className="skip-link"
          data-testid="skip-link"
        >
          Skip to main content
        </a>

        {/* Polite aria-live region for App-Router route changes. The Pages Router
            owns an equivalent announcer inside pages/_app.tsx — do not duplicate. */}
        <RouteAnnouncer />

        {/*
          Canonical site shell. SiteHeader is the page banner landmark, main is the
          single, unique main landmark, and SiteFooter is the page contentinfo
          landmark. Child layouts/segments MUST NOT render their own <main> or
          <footer role="contentinfo">; use <section> with aria-label instead so
          the landmark-unique rule isn't violated.
        */}
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 focus:outline-none"
            data-testid="main-content"
          >
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
