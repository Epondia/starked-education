import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import { GlobalShell } from '@/components/PWA/GlobalShell';
import { CommandPalette } from '@/components/ui/command-palette';
import { Breadcrumb } from '@/components/Breadcrumb';
import { OrganizationJsonLd } from '@/components/SEO';
import { createMetadata } from '@/lib/seo';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = createMetadata({
  title: 'StarkEd Education - Decentralized Learning Platform',
  description: 'Learn blockchain development with courses powered by Stellar',
  keywords: ['blockchain', 'stellar', 'education', 'web3', 'learning'],
  absolute: true,
});

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
          <GlobalShell />
          <OrganizationJsonLd />
          <div className="mx-auto w-full max-w-7xl px-4 pt-4">
            <Breadcrumb />
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
