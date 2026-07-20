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
  // NOTE: This segment intentionally does NOT render its own <html> or <body>.
  // The root App-Router layout (app/layout.tsx) owns those singletons.
  // Nesting <html>/<body> here would produce invalid HTML and cause axe-core
  // `landmark-unique` and `duplicate-id` violations.
  return (
    <AuthProvider>
      {/*
       * Skip link scoped to the admin area — lets keyboard users jump
       * directly past the sidebar to the admin content region.
       * WCAG 2.1 SC 2.4.1 (Bypass Blocks)
       */}
      <a href="#admin-content-region" className="skip-link">
        Skip to admin content
      </a>

      <div className="min-h-screen bg-gray-50">
        <div className="flex">
          <AdminSidebar />
          <div className="flex-1">
            <AdminHeader />
            {/*
             * role="region" + aria-label gives screen-reader users a labelled
             * sub-region within the root <main> landmark.
             * tabIndex={-1} allows the skip link to programmatically focus here.
             */}
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
