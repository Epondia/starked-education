'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileText,
  Shield,
  Settings,
  BarChart3,
  Database,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface SidebarItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  children?: SidebarItem[];
}

const sidebarItems: SidebarItem[] = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard
  },
  {
    title: 'User Management',
    href: '/admin/users',
    icon: Users,
    children: [
      { title: 'All Users', href: '/admin/users', icon: Users },
      { title: 'Roles & Permissions', href: '/admin/users/roles', icon: Shield },
      { title: 'User Activity', href: '/admin/users/activity', icon: BarChart3 }
    ]
  },
  {
    title: 'Content Management',
    href: '/admin/content',
    icon: BookOpen,
    children: [
      { title: 'Courses', href: '/admin/content/courses', icon: BookOpen },
      { title: 'Quizzes', href: '/admin/content/quizzes', icon: FileText },
      { title: 'Moderation', href: '/admin/content/moderation', icon: Shield }
    ]
  },
  {
    title: 'Analytics',
    href: '/admin/analytics',
    icon: BarChart3,
    children: [
      { title: 'Overview', href: '/admin/analytics', icon: BarChart3 },
      { title: 'User Analytics', href: '/admin/analytics/users', icon: Users },
      { title: 'Course Analytics', href: '/admin/analytics/courses', icon: BookOpen },
      { title: 'System Performance', href: '/admin/analytics/system', icon: Database }
    ]
  },
  {
    title: 'Platform Operations',
    href: '/admin/operations',
    icon: Settings,
    children: [
      { title: 'System Settings', href: '/admin/operations/settings', icon: Settings },
      { title: 'Backup & Restore', href: '/admin/operations/backup', icon: Database },
      { title: 'Security', href: '/admin/operations/security', icon: Shield },
      { title: 'Announcements', href: '/admin/operations/announcements', icon: Bell }
    ]
  }
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const toggleExpanded = (title: string) => {
    setExpandedItems(prev =>
      prev.includes(title)
        ? prev.filter(item => item !== title)
        : [...prev, title]
    );
  };

  const isActive = (href: string) => pathname === href;

  const renderSidebarItem = (item: SidebarItem, level = 0) => {
    const Icon = item.icon;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.title);
    const active = isActive(item.href);

    // Items with children are toggle buttons; leaf items are navigation links.
    const sharedClasses = `
      flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg transition-colors
      ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}
      ${isCollapsed && level === 0 ? 'justify-center' : ''}
    `;

    return (
      <div key={item.title} className="w-full">
        {hasChildren ? (
          /* Expandable group — render a <button> so it is keyboard-accessible */
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-controls={`sidebar-submenu-${item.title.replace(/\s+/g, '-').toLowerCase()}`}
            onClick={() => toggleExpanded(item.title)}
            title={isCollapsed ? item.title : undefined}
            className={sharedClasses}
          >
            <span className="flex items-center gap-3">
              <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {!isCollapsed && <span className="font-medium">{item.title}</span>}
            </span>
            {!isCollapsed && (
              isExpanded
                ? <ChevronDown className="w-4 h-4" aria-hidden="true" />
                : <ChevronRight className="w-4 h-4" aria-hidden="true" />
            )}
            {!isCollapsed && item.badge && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full" aria-label={`${item.badge} unread`}>
                {item.badge}
              </span>
            )}
          </button>
        ) : (
          /* Leaf item — render a proper Next.js <Link> */
          <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            title={isCollapsed ? item.title : undefined}
            className={sharedClasses}
          >
            <span className="flex items-center gap-3">
              <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {!isCollapsed && <span className="font-medium">{item.title}</span>}
            </span>
            {!isCollapsed && item.badge && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full" aria-label={`${item.badge} unread`}>
                {item.badge}
              </span>
            )}
          </Link>
        )}

        {hasChildren && !isCollapsed && isExpanded && (
          <div
            id={`sidebar-submenu-${item.title.replace(/\s+/g, '-').toLowerCase()}`}
            className="ml-4 mt-1 space-y-1"
            role="list"
            aria-label={`${item.title} sub-navigation`}
          >
            {item.children!.map(child => renderSidebarItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`
      bg-white border-r border-gray-200 h-screen sticky top-0 flex flex-col
      transition-all duration-300
      ${isCollapsed ? 'w-16' : 'w-64'}
    `}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <h1 className="text-xl font-bold text-gray-800">Admin Panel</h1>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
          >
            {isCollapsed ? <Menu className="w-5 h-5" aria-hidden="true" /> : <X className="w-5 h-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Navigation landmark — aria-label disambiguates it from any other nav on the page. */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto" aria-label="Admin navigation">
        {sidebarItems.map(item => renderSidebarItem(item))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <Link
          href="/"
          className={`
            flex items-center gap-3 px-3 py-2 text-sm text-gray-700 rounded-lg 
            hover:bg-red-50 hover:text-red-700 transition-colors
            ${isCollapsed ? 'justify-center' : ''}
          `}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span className="font-medium">Exit Admin</span>}
        </Link>
      </div>
    </div>
  );
}
