'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bell, Search, User, Settings, LogOut } from 'lucide-react';

interface AdminHeaderProps {
  title?: string;
}

export default function AdminHeader({ title = 'Dashboard' }: AdminHeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdowns on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifications(false);
        setShowUserMenu(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const notifications = [
    { id: 1, title: 'New user registration', message: '5 new users registered today', time: '2m ago', type: 'info' },
    { id: 2, title: 'System update', message: 'Platform maintenance scheduled', time: '1h ago', type: 'warning' },
    { id: 3, title: 'Content flagged', message: '3 courses need moderation', time: '3h ago', type: 'alert' }
  ];

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'alert': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4" aria-label="Admin top bar">
      <div className="flex items-center justify-between">
        {/* Page Title — deliberately not a heading element.
            Each admin page renders its own <h1> (the primary page heading).
            This label is decorative context for sighted users only. */}
        <div>
          <p className="text-2xl font-semibold text-gray-800" aria-hidden="true">{title}</p>
          <p className="text-sm text-gray-600 mt-1">Manage your StarkEd platform</p>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            {/* Icon is decorative; the placeholder supplies the label */}
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search users, courses, or content..."
              aria-label="Search users, courses, or content"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label={`Notifications${notifications.length > 0 ? ` (${notifications.length} unread)` : ''}`}
              aria-haspopup="true"
              aria-expanded={showNotifications}
              aria-controls="notifications-dropdown"
              className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Bell className="w-5 h-5" aria-hidden="true" />
              {notifications.length > 0 && (
                <span
                  className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"
                  aria-hidden="true"
                />
              )}
            </button>

            {showNotifications && (
              <div
                id="notifications-dropdown"
                role="menu"
                aria-label="Notifications"
                className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
              >
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-semibold text-gray-800 text-base">Notifications</h2>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.map(notification => (
                    <div
                      key={notification.id}
                      role="menuitem"
                      tabIndex={0}
                      className={`p-4 border-b border-gray-100 ${getNotificationColor(notification.type)}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{notification.title}</p>
                          <p className="text-xs mt-1 opacity-80">{notification.message}</p>
                        </div>
                        <span className="text-xs opacity-60">
                          <time>{notification.time}</time>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 text-center">
                  <button
                    role="menuitem"
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-label="User account menu"
              aria-haspopup="true"
              aria-expanded={showUserMenu}
              aria-controls="user-menu-dropdown"
              className="flex items-center gap-2 p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center" aria-hidden="true">
                <User className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <span className="font-medium">Admin User</span>
            </button>

            {showUserMenu && (
              <div
                id="user-menu-dropdown"
                role="menu"
                aria-label="User account options"
                className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
              >
                <div className="p-3 border-b border-gray-200" role="none">
                  <p className="font-medium text-gray-800">Admin User</p>
                  <p className="text-sm text-gray-600">admin@starked.com</p>
                </div>
                <div className="py-2">
                  <button
                    role="menuitem"
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    <Settings className="w-4 h-4" aria-hidden="true" />
                    Settings
                  </button>
                  <button
                    role="menuitem"
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
                  >
                    <LogOut className="w-4 h-4" aria-hidden="true" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
