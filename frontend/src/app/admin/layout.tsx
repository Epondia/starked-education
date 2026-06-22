import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import AdminSidebar from '@/components/Admin/AdminSidebar';
import AdminHeader from '@/components/Admin/AdminHeader';
import { AuthProvider } from '@/contexts/AuthContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Admin Panel - StarkEd Education',
  description: 'Administrative interface for StarkEd platform management',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <div className="min-h-screen bg-gray-50">
            <div className="flex">
              <AdminSidebar />
              <div className="flex-1">
                {/*
                  Previously the admin layout declared its own <main>. With the
                  canonical <main> now owned by app/layout.tsx, declaring another
                  here trips axe-core's landmark-unique rule on every admin
                  route. Wrap the admin content in a labelled <section> instead
                  so screen readers still announce the region without violating
                  uniqueness.
                */}
                <AdminHeader />
                <section
                  aria-label="Admin content"
                  className="p-6"
                  data-testid="admin-content-section"
                >
                  {children}
                </section>
              </div>
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
