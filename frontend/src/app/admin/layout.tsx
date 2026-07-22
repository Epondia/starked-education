import type { Metadata } from 'next';
import AdminSidebar from '@/components/Admin/AdminSidebar';
import AdminHeader from '@/components/Admin/AdminHeader';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  title: 'Admin Panel - StarkEd Education',
  description: 'Administrative interface for StarkEd platform management',
};

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
  //
  // ALSO: App Router segments MUST NOT render <html> or <body> — those are
  // reserved for the root layout. This segment renders only the admin chrome.
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50">
        <div className="flex">
          <AdminSidebar />
          <div className="flex-1">
            <AdminHeader />
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
  );
}
