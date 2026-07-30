import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import AdminSidebar from '@/components/Admin/AdminSidebar';
import AdminHeader from '@/components/Admin/AdminHeader';
import { AuthProvider } from '@/contexts/AuthContext';
import { Breadcrumb } from '@/components/Breadcrumb';
import { createMetadata } from '@/lib/seo';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = createMetadata({
  title: 'Admin Panel',
  description: 'Administrative interface for StarkEd platform management',
  keywords: ['admin', 'platform', 'management'],
  noIndex: true,
});

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // NOTE: This segment intentionally does NOT render its own <main>. The root
  // App-Router layout (`app/layout.tsx`) provides the single canonical
  // <main id="main-content"> landmark. Adding a second <main> here would
  // produce invalid HTML and trip axe-core's `landmark-unique` rule.
  // We attach `role="region"` + aria-label so admin screen-reader users get a
  // labelled sub-region within the main landmark.
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <div className="min-h-screen bg-gray-50">
            <div className="flex">
              <AdminSidebar />
              <div className="flex-1">
                <AdminHeader />
                <div className="mx-auto w-full max-w-7xl px-4 pt-2">
                  <Breadcrumb />
                </div>
                <section
                  id="admin-content-region"
                  aria-label="Admin content"
                  tabIndex={-1}
                  className="focus:outline-none p-6"
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
