import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';
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
         * Skip-to-content link — first focusable element on the page.
         * The .skip-link class in styles/globals.css hides it off-screen
         * until focused, then slides it into view.
         * WCAG 2.1 SC 2.4.1 (Bypass Blocks)
         */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

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
           * RouteAnnouncer — announces navigation changes to screen readers.
           * WCAG 2.1 SC 4.1.3 (Status Messages)
           */}
          <RouteAnnouncer />
          <GlobalShell />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
