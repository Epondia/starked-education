'use client';

import React, { useEffect, useRef } from 'react';
import { Wallet, RefreshCw, CheckCircle2, SkipForward, AlertCircle } from 'lucide-react';
import { useStellarWallet } from '@/context/WalletContext';

export interface WalletStepProps {
  walletAddress: string | null;
  walletSkipped: boolean;
  onUpdate: (data: { walletAddress: string | null; walletSkipped: boolean }) => void;
  onNext: () => void;
  onBack: () => void;
}

/**
 * WalletStep — third step of the onboarding wizard.
 *
 * Prompts the user to connect a Stellar wallet (Freighter/Albedo) via the
 * existing `useStellarWallet` hook. Includes a "Skip for now" option so
 * onboarding can complete without a wallet — the user can connect later
 * from Settings.
 */
export const WalletStep: React.FC<WalletStepProps> = ({
  walletAddress,
  walletSkipped,
  onUpdate,
  onNext,
  onBack,
}) => {
  const { address, isConnected, isConnecting, connect, error } = useStellarWallet();
  const skipButtonRef = useRef<HTMLButtonElement>(null);

  // Sync the connected wallet address up to the wizard state whenever it
  // changes (either from a connection in this step or auto-reconnection).
  useEffect(() => {
    if (isConnected && address) {
      onUpdate({ walletAddress: address, walletSkipped: false });
    }
  }, [isConnected, address, onUpdate]);

  const shortenAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleConnect = async () => {
    try {
      await connect();
    } catch (err) {
      // Error state is surfaced via the `error` from the hook
    }
  };

  const handleSkip = () => {
    onUpdate({ walletAddress: null, walletSkipped: true });
    onNext();
  };

  const handleNext = () => {
    if (isConnected && address) {
      onUpdate({ walletAddress: address, walletSkipped: false });
    }
    onNext();
  };

  const canProceed = isConnected || walletSkipped;

  return (
    <div className="flex flex-col py-4 px-4 sm:px-8">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-1">
        Connect Your Wallet
      </h2>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
        Link your Stellar wallet to enroll in courses, receive credentials,
        and make payments on-chain.
      </p>

      {/* Connection status card */}
      <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-6 mb-6">
        {isConnected && address ? (
          /* Connected state */
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              Wallet Connected!
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 font-mono break-all">
              {shortenAddress(address)}
            </p>
          </div>
        ) : (
          /* Disconnected state */
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-3">
              <Wallet className="w-7 h-7 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              {isConnecting ? 'Connecting...' : 'No Wallet Connected'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4 max-w-sm">
              We support Freighter, Albedo, and other Stellar-compatible
              wallets. Click below to open your wallet extension.
            </p>
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
            >
              {isConnecting ? (
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Wallet className="w-4 h-4" aria-hidden="true" />
              )}
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div
          className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2.5 mb-4"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Skip option */}
      {!isConnected && (
        <div className="flex items-center justify-center mb-6">
          <button
            ref={skipButtonRef}
            onClick={handleSkip}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded-md px-2 py-1"
          >
            <SkipForward className="w-4 h-4" aria-hidden="true" />
            Skip for now — I’ll connect later
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-2">
        <button
          onClick={onBack}
          className="px-5 py-2.5 text-gray-600 dark:text-slate-300 font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
        >
          {isConnected ? 'Continue' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

export default WalletStep;
