import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  RotateCcw
} from 'lucide-react';
import { useOfflineSync } from '../../hooks/useOfflineSync';

export const OfflineIndicator: React.FC = () => {
  const { syncStatus, isOnline, isSyncing, triggerSync, retryAllFailed, retryItem, removeFromQueue } = useOfflineSync({
    autoSync: true,
    maxRetries: 3,
    backoffBase: 1000
  });

  const [showDetails, setShowDetails] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
      setDismissed(false);
    }
    if (isOnline && wasOffline) {
      setWasOffline(false);
      const timer = setTimeout(() => {
        setDismissed(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  const failedItems = syncStatus.items.filter(i => i.status === 'failed');
  const pendingItems = syncStatus.items.filter(i => i.status === 'pending');
  const hasQueue = pendingItems.length > 0 || failedItems.length > 0;

  if (dismissed && isOnline && !hasQueue) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed top-0 left-0 right-0 z-50"
      >
        <div
          className={`px-4 py-2 shadow-md ${
            !isOnline
              ? 'bg-red-600 text-white'
              : isSyncing
              ? 'bg-blue-600 text-white'
              : failedItems.length > 0
              ? 'bg-amber-500 text-white'
              : wasOffline
              ? 'bg-green-600 text-white'
              : 'bg-gray-800 text-white'
          }`}
        >
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {!isOnline ? (
                <WifiOff className="w-4 h-4 flex-shrink-0" />
              ) : isSyncing ? (
                <RefreshCw className="w-4 h-4 flex-shrink-0 animate-spin" />
              ) : failedItems.length > 0 ? (
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              ) : wasOffline ? (
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
              ) : (
                <Wifi className="w-4 h-4 flex-shrink-0" />
              )}

              <span className="text-sm font-medium truncate">
                {!isOnline
                  ? 'You are offline — changes will sync when connected'
                  : isSyncing
                  ? 'Syncing your changes...'
                  : failedItems.length > 0
                  ? `${failedItems.length} sync item${failedItems.length > 1 ? 's' : ''} failed`
                  : wasOffline
                  ? 'Back online — all changes synced'
                  : `${pendingItems.length} pending sync item${pendingItems.length !== 1 ? 's' : ''}`}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              {!isOnline && <Clock className="w-3 h-3 opacity-70" />}

              {failedItems.length > 0 && isOnline && (
                <button
                  onClick={retryAllFailed}
                  disabled={isSyncing}
                  className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 rounded px-2 py-1 transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">Retry All</span>
                </button>
              )}

              {isSyncing && (
                <span className="text-xs opacity-80">
                  {syncStatus.queuedItems} remaining
                </span>
              )}

              {isOnline && !isSyncing && hasQueue && (
                <button
                  onClick={triggerSync}
                  className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 rounded px-2 py-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span className="hidden sm:inline">Sync Now</span>
                </button>
              )}

              <button
                onClick={() => setShowDetails(!showDetails)}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                aria-label={showDetails ? 'Hide details' : 'Show details'}
              >
                {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="max-w-4xl mx-auto mt-2 overflow-hidden"
            >
              <div className="border-t border-white/20 pt-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-2">
                  <div className="bg-white/10 rounded p-2">
                    <div className="opacity-70">Pending</div>
                    <div className="font-bold">{pendingItems.length}</div>
                  </div>
                  <div className="bg-white/10 rounded p-2">
                    <div className="opacity-70">Syncing</div>
                    <div className="font-bold">{syncStatus.items.filter(i => i.status === 'syncing').length}</div>
                  </div>
                  <div className="bg-white/10 rounded p-2">
                    <div className="opacity-70">Synced</div>
                    <div className="font-bold">{syncStatus.items.filter(i => i.status === 'synced').length}</div>
                  </div>
                  <div className="bg-white/10 rounded p-2">
                    <div className="opacity-70">Failed</div>
                    <div className="font-bold">{failedItems.length}</div>
                  </div>
                </div>

                {failedItems.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs font-semibold mb-1 opacity-80">Failed Items</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {failedItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between bg-red-500/30 rounded px-2 py-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <XCircle className="w-3 h-3 flex-shrink-0" />
                            <span className="text-xs truncate">{item.endpoint}</span>
                            {item.lastError && (
                              <span className="text-xs opacity-60 truncate ml-1">— {item.lastError}</span>
                            )}
                          </div>
                          {isOnline && (
                            <button
                              onClick={() => retryItem(item.id)}
                              disabled={isSyncing}
                              className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 rounded px-1.5 py-0.5 transition-colors flex-shrink-0 ml-2 disabled:opacity-50"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              Retry
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {syncStatus.lastSyncTime && (
                  <div className="text-xs opacity-60">
                    Last synced: {syncStatus.lastSyncTime.toLocaleTimeString()}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default OfflineIndicator;
