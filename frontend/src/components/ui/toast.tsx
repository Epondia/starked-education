'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  variant: ToastVariant;
  title?: string;
  message: string;
  /** ms before auto-dismiss. 0 = never. Default 5000. */
  duration: number;
  action?: ToastAction;
}

export interface ToastOptions {
  variant?: ToastVariant;
  title?: string;
  /** ms before auto-dismiss. 0 = never. Default 5000. */
  duration?: number;
  action?: ToastAction;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 5000;

type ToastState = {
  /** Toasts currently rendered on screen (≤ MAX_VISIBLE). */
  visible: Toast[];
  /** Overflow waiting to be shown. */
  queue: Toast[];
};

type ToastReducerAction =
  | { type: 'ADD'; toast: Toast }
  | { type: 'DISMISS'; id: string };

function toastReducer(
  state: ToastState,
  action: ToastReducerAction
): ToastState {
  switch (action.type) {
    case 'ADD': {
      if (state.visible.length < MAX_VISIBLE) {
        return { ...state, visible: [...state.visible, action.toast] };
      }
      return { ...state, queue: [...state.queue, action.toast] };
    }
    case 'DISMISS': {
      const visible = state.visible.filter((t) => t.id !== action.id);
      // Promote the next queued toast when a slot opens up
      if (state.queue.length > 0 && visible.length < MAX_VISIBLE) {
        const [next, ...rest] = state.queue;
        return { visible: [...visible, next], queue: rest };
      }
      return { ...state, visible };
    }
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ToastContextValue {
  addToast: (message: string, options?: ToastOptions) => string;
  dismissToast: (id: string) => void;
  success: (message: string, options?: Omit<ToastOptions, 'variant'>) => string;
  error: (message: string, options?: Omit<ToastOptions, 'variant'>) => string;
  warning: (message: string, options?: Omit<ToastOptions, 'variant'>) => string;
  info: (message: string, options?: Omit<ToastOptions, 'variant'>) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, {
    visible: [],
    queue: [],
  });

  const addToast = useCallback(
    (message: string, options: ToastOptions = {}): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      dispatch({
        type: 'ADD',
        toast: {
          id,
          message,
          variant: options.variant ?? 'info',
          title: options.title,
          duration: options.duration ?? DEFAULT_DURATION,
          action: options.action,
        },
      });
      return id;
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    dispatch({ type: 'DISMISS', id });
  }, []);

  const success = useCallback(
    (message: string, options?: Omit<ToastOptions, 'variant'>) =>
      addToast(message, { ...options, variant: 'success' }),
    [addToast]
  );

  const error = useCallback(
    (message: string, options?: Omit<ToastOptions, 'variant'>) =>
      addToast(message, { ...options, variant: 'error' }),
    [addToast]
  );

  const warning = useCallback(
    (message: string, options?: Omit<ToastOptions, 'variant'>) =>
      addToast(message, { ...options, variant: 'warning' }),
    [addToast]
  );

  const info = useCallback(
    (message: string, options?: Omit<ToastOptions, 'variant'>) =>
      addToast(message, { ...options, variant: 'info' }),
    [addToast]
  );

  return (
    <ToastContext.Provider
      value={{ addToast, dismissToast, success, error, warning, info }}
    >
      {children}
      <ToastContainer toasts={state.visible} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

// ─── Container (portal) ───────────────────────────────────────────────────────

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const [mounted, setMounted] = React.useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

// ─── Individual toast ─────────────────────────────────────────────────────────

const variantConfig: Record<
  ToastVariant,
  { icon: React.ElementType; borderClass: string; iconClass: string }
> = {
  success: {
    icon: CheckCircle2,
    borderClass: 'border-l-green-500',
    iconClass: 'text-green-500 dark:text-green-400',
  },
  error: {
    icon: AlertCircle,
    borderClass: 'border-l-red-500',
    iconClass: 'text-red-500 dark:text-red-400',
  },
  warning: {
    icon: AlertTriangle,
    borderClass: 'border-l-amber-500',
    iconClass: 'text-amber-500 dark:text-amber-400',
  },
  info: {
    icon: Info,
    borderClass: 'border-l-blue-500',
    iconClass: 'text-blue-500 dark:text-blue-400',
  },
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { icon: Icon, borderClass, iconClass } = variantConfig[toast.variant];

  // Auto-dismiss
  useEffect(() => {
    if (toast.duration === 0) return;
    timerRef.current = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, onDismiss]);

  // Keyboard dismiss (Escape key)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss(toast.id);
    },
    [toast.id, onDismiss]
  );

  return (
    <motion.div
      layout
      role="alert"
      aria-atomic="true"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'pointer-events-auto w-full rounded-lg border border-l-4 bg-white dark:bg-gray-900',
        'shadow-lg px-4 py-3',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        borderClass
      )}
    >
      <div className="flex items-start gap-3">
        {/* Variant icon */}
        <Icon
          className={cn('mt-0.5 h-5 w-5 flex-shrink-0', iconClass)}
          aria-hidden="true"
        />

        {/* Message content */}
        <div className="flex-1 min-w-0">
          {toast.title && (
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {toast.title}
            </p>
          )}
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {toast.message}
          </p>

          {/* Optional action button */}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action!.onClick();
                onDismiss(toast.id);
              }}
              className="mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline-offset-2 hover:underline focus:outline-none focus-visible:underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        {/* Close button */}
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => onDismiss(toast.id)}
          className="flex-shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToastContext(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToastContext must be used within a ToastProvider');
  }
  return ctx;
}

export { ToastContext };
