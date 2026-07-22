'use client';

import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, LogIn } from 'lucide-react';
import { loginSchema, type LoginFormData, type LoginFormDataIn } from '@/lib/schemas';
import { FormField } from '@/components/forms/FormField';

export interface LoginFormProps {
  /** Called on successful form submission. */
  onSubmit: (data: LoginFormData) => Promise<void>;
  /** Link to the register page. */
  registerHref?: string;
  /** Link for forgotten passwords. */
  forgotPasswordHref?: string;
  /** Override the default submit button label. */
  submitLabel?: string;
}

/**
 * Login form with real-time (onBlur) Zod validation and inline error states.
 *
 * - Email and password fields validated against `loginSchema`
 * - Submit button disabled while invalid or submitting
 * - Server errors surfaced as a top-level banner
 */
export function LoginForm({
  onSubmit,
  registerHref = '/auth/register',
  forgotPasswordHref = '/auth/forgot-password',
  submitLabel = 'Sign in',
}: LoginFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<LoginFormDataIn, any, LoginFormData>({
    resolver: zodResolver(
      loginSchema as unknown as Parameters<typeof zodResolver>[0],
    ) as unknown as Resolver<LoginFormDataIn, any, LoginFormData>,
    mode: 'onBlur',
  });

  const onFormSubmit = async (data: LoginFormData) => {
    setServerError(null);
    try {
      await onSubmit(data);
    } catch (error: unknown) {
      setServerError(
        error instanceof Error ? error.message : 'Login failed. Please try again.'
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      noValidate
      aria-labelledby="login-heading"
      className="space-y-5"
    >
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
        autoComplete="current-password"
        required
        placeholder="Enter your password"
        error={errors.password?.message}
        {...register('password')}
      />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            {...register('rememberMe')}
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Remember me</span>
        </label>
        <a
          href={forgotPasswordHref}
          className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 underline underline-offset-2"
        >
          Forgot password?
        </a>
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
            Signing in…
          </>
        ) : (
          <>
            <LogIn className="w-4 h-4" aria-hidden="true" />
            {submitLabel}
          </>
        )}
      </button>

      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        Don&apos;t have an account?{' '}
        <a
          href={registerHref}
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium underline underline-offset-2"
        >
          Create one
        </a>
      </p>
    </form>
  );
}
