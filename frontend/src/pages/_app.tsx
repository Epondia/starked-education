import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { appWithTranslation } from 'next-i18next';
import { ThemeProvider } from 'next-themes';
import nextI18NextConfig from '../../next-i18next.config';
import { WalletProvider } from '../context/WalletContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Toaster } from 'react-hot-toast';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ErrorBoundary key={router.asPath}>
        <WalletProvider>
          <Component {...pageProps} />
          <Toaster position="bottom-right" />
        </WalletProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default appWithTranslation(MyApp, nextI18NextConfig);
