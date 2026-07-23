'use client';

/**
 * useToast
 *
 * Thin re-export so consumers can write:
 *   import { useToast } from '@/hooks/useToast';
 *
 * All state management lives in ToastProvider (components/ui/toast.tsx).
 */

export { useToastContext as useToast } from '@/components/ui/toast';
export type {
  ToastOptions,
  ToastVariant,
  ToastAction,
  Toast,
} from '@/components/ui/toast';
