'use client';

import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, UserPlus } from 'lucide-react';
import {
  registerSchema,
  type RegisterFormData,
  type RegisterFormDataIn,
} from '@/lib/schemas';
import { FormField } from '@/components/forms/FormField';

export interface RegisterFormProps {
  /** Called on successful form submission. */
  onSubmit: (data: RegisterFormData) => Promise<void>;
  /** Link to the login page. */
  loginHref?: string;
  /** Override the default submit button label. */
  submitLabel?: string;
}

/**
 * Registration form with real-time (onBlur) Zod validation and inline error states.
 *
 * - Name, email, password, confirm password, and terms checkbox
 * - Password complexity requirements surfaced inline
 * - Submit button disabled while form is invalid or submitting
 */
export function RegisterForm({
  onSubmit,
  loginHref = '/auth/login',
  submitLabel = 'Create account',
}: RegisterFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<RegisterFormDataIn, any, RegisterFormData>({
    resolver: zodResolver(
      registerSchema as unknown as Parameters<typeof zodResolver>[0],
    ) as unknown as Resolver<RegisterFormDataIn, any, RegisterFormData>,
    mode: 'onChange',
  });

  const onFormSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    try {
      await onSubmit(data);
    } catch (error: unknown) {
      setServerError(
        error instanceof Error ? error.message : 'Registration failed. Please try again.'
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      noValidate
      aria-labelledby="register-heading"
      className="space-y-5"
    >
      <FormField
        label="Full name"
        type="text"
        autoComplete="name"
        required
        placeholder="Jane Doe"
        error={errors.name?.message}
        {...register('name')}
      />

      <FormField
        label="Email address"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register('email')}
      />

      <FormField
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        placeholder="At least 8 characters"
        helperText="Must contain uppercase, lowercase, and a number."
        error={errors.password?.message}
        {...register('password')}
      />

      <FormField
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        placeholder="Re-enter your password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <div>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            aria-describedby={errors.acceptTerms ? 'terms-error' : undefined}
            {...register('acceptTerms')}
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            I agree to the{' '}
            <a href="/terms" className="text-blue-600 underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-blue-600 underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
          </span>
        </label>
        {errors.acceptTerms && (
          <p id="terms-error" role="alert" className="mt-1 ml-6 text-sm text-red-600 dark:text-red-400">
            {errors.acceptTerms.message}
          </p>
        )}
      </div>

      {serverError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400"
        >
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !isValid}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Creating account…
          </>
        ) : (
          <>
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            {submitLabel}
          </>
        )}
      </button>

      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        Already have an account?{' '}
        <a
          href={loginHref}
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium underline underline-offset-2"
        >
          Sign in
        </a>
      </p>
    </form>
  );
}
