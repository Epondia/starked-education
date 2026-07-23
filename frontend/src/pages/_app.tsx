import type { AppProps } from 'next/app';
import { WalletProvider } from '../context/WalletContext';
import { ThemeProvider } from '../context/ThemeContext';
import { Toaster } from 'react-hot-toast';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <WalletProvider>
        <Component {...pageProps} />
        <Toaster position="bottom-right" />
      </WalletProvider>
    </ThemeProvider>
  );
}

export default MyApp;
