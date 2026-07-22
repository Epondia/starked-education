import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import { performanceMonitor } from '@/lib/performance-monitor';
import { GlobalShell } from '@/components/PWA/GlobalShell';
import { CommandPalette } from '@/components/ui/command-palette';
import RouteAnnouncer from '@/components/accessibility/RouteAnnouncer';

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
    /*
     * suppressHydrationWarning is required because next-themes injects a
     * `class` attribute on <html> on the client before React hydration
     * completes, which would otherwise trigger a mismatch warning.
     */
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className={inter.className}>
        {/*
         * ThemeProvider configuration:
         *   attribute="class"      → Tailwind darkMode: 'class' strategy
         *   defaultTheme="system"  → first visit follows OS preference
         *   enableSystem           → listens for prefers-color-scheme changes
         *   storageKey             → persists choice under 'starked-theme'
         *   disableTransitionOnChange={false} → our CSS handles transitions
         */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="starked-theme"
          disableTransitionOnChange={false}
        >
          {/*
           * WCAG 2.4.1 — Skip navigation link.
           * Visually hidden until focused; jumps keyboard users past global chrome.
           * The target #main-content is set on the <main> landmark below.
           */}
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>

          <GlobalShell />

          {/*
           * Single canonical <main> landmark for the App Router.
           * Admin sub-layout must NOT nest another <main>; it uses
           * role="region" + aria-label instead.
           * tabIndex={-1} lets the skip-link move focus programmatically.
           */}
          <main id="main-content" tabIndex={-1} className="focus:outline-none">
            {children}
          </main>

          {/*
           * WCAG 4.1.3 — Route-change announcements for screen readers.
           * Politely announces the new pathname on every client-side navigation.
           */}
          <RouteAnnouncer />
        </ThemeProvider>
      </body>
    </html>
  );
}
