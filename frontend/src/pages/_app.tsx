import type { AppProps } from 'next/app';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { appWithTranslation } from 'next-i18next';
import PlausibleProvider from 'next-plausible';
import nextI18NextConfig from '../../next-i18next.config';
import { WalletProvider } from '../context/WalletContext';
import { ThemeProvider } from '../context/ThemeContext';
import { Toaster } from 'react-hot-toast';
import '../styles/globals.css';

const PAGE_SEO: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Temporal Learning Studio - StarkEd Education',
    description: 'Adaptive learning pacing with personalization and reversible safety guardrails.',
  },
  '/analytics': {
    title: 'Learning Analytics - StarkEd Education',
    description: 'Track learning progress, course completion, and performance insights.',
  },
  '/discovery': {
    title: 'Discover Courses - StarkEd Education',
    description: 'Explore blockchain, Stellar, and decentralized education courses.',
  },
  '/collaboration': {
    title: 'Virtual Classroom - StarkEd Education',
    description: 'Collaborate with educators and learners in a shared virtual classroom.',
  },
  '/notifications-demo': {
    title: 'Wallet and Notifications Demo - StarkEd Education',
    description: 'Explore StarkEd wallet integration and real-time learning notifications.',
  },
  '/demo-features': {
    title: 'Platform Features - StarkEd Education',
    description: 'Explore StarkEd assessment, credential, marketplace, and staking features.',
  },
  '/chat-assistant': {
    title: 'Learning Assistant - StarkEd Education',
    description: 'Get contextual help while studying StarkEd courses.',
  },
  '/bio-learning-demo': {
    title: 'Bio-Integrated Learning - StarkEd Education',
    description: 'Explore adaptive learning feedback and biometric simulation features.',
  },
  '/bci-dashboard': {
    title: 'Learning Dashboard - StarkEd Education',
    description: 'Review learning activity and personalized progress signals.',
  },
  '/consciousness': {
    title: 'Digital Learning Records - StarkEd Education',
    description: 'Preserve educational achievements and learning records on the blockchain.',
  },
};

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

  const canonicalPath = router.asPath.split(/[?#]/, 1)[0] || '/';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const normalizedSiteUrl = siteUrl.replace(/\/$/, '');
  const canonicalUrl = `${normalizedSiteUrl}${canonicalPath === '/' ? '/' : canonicalPath}`;
  const seo = PAGE_SEO[router.pathname] || {
    title: 'StarkEd Education',
    description: 'Learn blockchain development with courses powered by Stellar.',
  };

  return (
    <>
      <Head>
        <title key="title">{seo.title}</title>
        <meta name="description" content={seo.description} key="description" />
        <meta property="og:site_name" content="StarkEd Education" key="og:site_name" />
        <meta property="og:title" content={seo.title} key="og:title" />
        <meta property="og:description" content={seo.description} key="og:description" />
        <meta property="og:type" content="website" key="og:type" />
        <meta property="og:url" content={canonicalUrl} key="og:url" />
        <meta property="og:image" content={`${normalizedSiteUrl}/og-image.png`} key="og:image" />
        <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
        <link rel="canonical" href={canonicalUrl} key="canonical" />
      </Head>
      {/* Flash prevention for Pages Router - runs before React hydration */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var stored = localStorage.getItem('starked-theme-preference');
                var theme = 'light';
                if (stored === 'dark' || stored === 'light') {
                  theme = stored;
                } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                  theme = 'dark';
                }
                document.documentElement.classList.toggle('dark', theme === 'dark');
                document.documentElement.style.colorScheme = theme;
              } catch(e) {}
            })();
          `,
        }}
      />
      <ThemeProvider>
        <WalletProvider>
          <Component {...pageProps} />
          <Toaster position="bottom-right" />
        </WalletProvider>
      </ThemeProvider>
    </>
  );
}

export default appWithTranslation(MyApp, nextI18NextConfig);
