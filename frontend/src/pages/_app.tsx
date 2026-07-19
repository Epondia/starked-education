import type { AppProps } from 'next/app';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { appWithTranslation } from 'next-i18next';
import { ThemeProvider } from 'next-themes';
import PlausibleProvider from 'next-plausible';
import nextI18NextConfig from '../../next-i18next.config';
import { WalletProvider } from '../context/WalletContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { GlobalShell } from '../components/PWA/GlobalShell';
import { CookieConsentBanner } from '../components/CookieConsentBanner';
import { Toaster } from 'react-hot-toast';
import '../styles/globals.css';

export function reportWebVitals(metric: any) {
  if (typeof window !== 'undefined' && (window as any).plausible) {
    (window as any).plausible('Web Vitals', {
      props: {
        metric: metric.name,
        value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
      },
    });
  }
}

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const hasMounted = useRef(false);

  useEffect(() => {
    const main = document.querySelector('main');
    if (main && !main.id) {
      main.id = 'main-content';
    }

    if (hasMounted.current) {
      const pageHeading = document.querySelector('main h1');
      if (pageHeading instanceof HTMLElement) {
        pageHeading.setAttribute('tabindex', '-1');
        pageHeading.focus({ preventScroll: true });
      } else if (main instanceof HTMLElement) {
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
      }
    }

    hasMounted.current = true;
  }, [router.asPath]);

  return (
    <PlausibleProvider domain="starked-education.com" trackLocalhost={true}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="starked-theme">
        <ErrorBoundary key={router.asPath}>
          <WalletProvider>
            <a className="skip-link" href="#main-content">
              Skip to main content
            </a>
            <div
              className="sr-only"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {`Navigated to ${router.asPath}`}
            </div>
            <GlobalShell />
            <Component {...pageProps} />
            <CookieConsentBanner />
            <Toaster
              position="bottom-right"
              toastOptions={{
                ariaProps: { role: 'status', 'aria-live': 'polite' },
              }}
            />
          </WalletProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </PlausibleProvider>
  );
}

export default appWithTranslation(MyApp, nextI18NextConfig);
