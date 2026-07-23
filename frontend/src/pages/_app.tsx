import type { AppProps } from 'next/app';
import { WalletProvider } from '../context/WalletContext';
import { ThemeProvider } from '../context/ThemeContext';
import { Toaster } from 'react-hot-toast';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
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

export default MyApp;
