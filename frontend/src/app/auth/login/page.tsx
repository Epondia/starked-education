'use client';

import { useRouter } from 'next/navigation';
import { LoginForm } from '@/components/forms/LoginForm';
import type { LoginFormData } from '@/lib/schemas';

export default function LoginPage() {
  const router = useRouter();

  const handleLogin = async (data: LoginFormData) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email, password: data.password }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.message ?? 'Invalid email or password');
    }

    const { token } = await response.json();
    if (token) {
      localStorage.setItem('admin_token', token);
    }

    router.push('/');
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <span className="inline-block text-3xl font-bold text-blue-600">StarkEd</span>
          <h1 id="login-heading" className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
            Sign in to your account
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Welcome back! Please enter your details.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md border border-gray-200 dark:border-slate-700 p-8">
          <LoginForm
            onSubmit={handleLogin}
            registerHref="/auth/register"
            forgotPasswordHref="/auth/forgot-password"
          />
        </div>
      </div>
    </main>
  );
}
