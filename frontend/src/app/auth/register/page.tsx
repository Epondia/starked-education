'use client';

import { useRouter } from 'next/navigation';
import { RegisterForm } from '@/components/forms/RegisterForm';
import type { RegisterFormData } from '@/lib/schemas';

export default function RegisterPage() {
  const router = useRouter();

  const handleRegister = async (data: RegisterFormData) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        password: data.password,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.message ?? 'Registration failed. Please try again.');
    }

    // Redirect to login so the user signs in after registering
    router.push('/auth/login?registered=true');
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <span className="inline-block text-3xl font-bold text-blue-600">StarkEd</span>
          <h1 id="register-heading" className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Join StarkEd and start earning verifiable credentials.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md border border-gray-200 dark:border-slate-700 p-8">
          <RegisterForm
            onSubmit={handleRegister}
            loginHref="/auth/login"
          />
        </div>
      </div>
    </main>
  );
}
