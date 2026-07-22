'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface FormFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement>, 'className'> {
  label: string;
  error?: string;
  helperText?: string;
  multiline?: boolean;
  rows?: number;
  containerClassName?: string;
  inputClassName?: string;
  required?: boolean;
}

/**
 * Reusable form field component with inline error states.
 * 
 * Features:
 * - Automatic error styling (red border) when error prop is present
 * - Error icon and message display
 * - Support for both input and textarea
 * - Helper text for additional context
 * - Required field indicator
 * - Accessible ARIA attributes
 * 
 * @example
 * ```tsx
 * <FormField
 *   label="Email"
 *   type="email"
 *   error={errors.email?.message}
 *   {...register('email')}
 * />
 * ```
 */
export const FormField = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  FormFieldProps
>(
  (
    {
      label,
      error,
      helperText,
      multiline = false,
      rows = 3,
      containerClassName,
      inputClassName,
      required = false,
      id,
      ...props
    },
    ref
  ) => {
    // Generate a unique ID if not provided
    const fieldId = id || `field-${React.useId()}`;
    const errorId = `${fieldId}-error`;
    const helperId = `${fieldId}-helper`;

    const hasError = Boolean(error);

    const baseInputClasses = cn(
      'w-full px-3 py-2 border rounded-lg transition-colors',
      'bg-white dark:bg-slate-800',
      'text-gray-900 dark:text-white',
      'placeholder:text-gray-500 dark:placeholder:text-gray-400',
      'focus:outline-none focus:ring-2 focus:ring-offset-2',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      hasError
        ? 'border-red-400 dark:border-red-600 focus:ring-red-500 focus:border-red-500'
        : 'border-gray-300 dark:border-slate-600 focus:ring-blue-500 focus:border-blue-500',
      inputClassName
    );

    return (
      <div className={cn('space-y-1', containerClassName)}>
        <Label htmlFor={fieldId} className="text-gray-700 dark:text-gray-300">
          {label}
          {required && <span className="text-red-500 ml-1" aria-label="required">*</span>}
        </Label>

        {multiline ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            id={fieldId}
            rows={rows}
            aria-invalid={hasError}
            aria-describedby={
              hasError
                ? errorId
                : helperText
                  ? helperId
                  : undefined
            }
            className={cn(baseInputClasses, 'resize-none')}
            {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <Input
            ref={ref as React.Ref<HTMLInputElement>}
            id={fieldId}
            aria-invalid={hasError}
            aria-describedby={
              hasError
                ? errorId
                : helperText
                  ? helperId
                  : undefined
            }
            className={baseInputClasses}
            {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
          />
        )}

        {/* Error message */}
        {hasError && (
          <div
            id={errorId}
            role="alert"
            className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Helper text (only shown when no error) */}
        {!hasError && helperText && (
          <p
            id={helperId}
            className="text-sm text-gray-600 dark:text-gray-400"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';
