'use client';

import React, { useState } from 'react';
import { Bell, Search, User, Settings, LogOut, X, Menu } from 'lucide-react';

interface AdminHeaderProps {
  title?: string;
}

export default function AdminHeader({ title = 'Dashboard' }: AdminHeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  /** Search bar is collapsed to an icon on mobile; expanded on md+ */
  const [searchExpanded, setSearchExpanded] = useState(false);

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
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4" aria-label="Admin top bar">
      {/* ─── Main row ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        {/* Page Title — hidden when mobile search is expanded */}
        <div className={`min-w-0 ${searchExpanded ? 'hidden sm:block' : 'block'}`}>
          <h1 className="text-lg sm:text-2xl font-semibold text-gray-800 truncate">{title}</h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-0.5 hidden sm:block">
            Manage your StarkEd platform
          </p>
        </div>

        {/* ── Search — full-width bar on md+, expandable icon on mobile ────── */}
        <div className={`
          flex-1 transition-all duration-200
          ${searchExpanded ? 'block' : 'hidden sm:block'}
          sm:max-w-md sm:mx-4 lg:mx-8
        `}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search users, courses, or content..."
              aria-label="Search admin"
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {/* Close button — only rendered when search is expanded on mobile */}
            {searchExpanded && (
              <button
                type="button"
                onClick={() => setSearchExpanded(false)}
                className="sm:hidden absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 touch-target"
                aria-label="Close search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ── Right-side actions ───────────────────────────────────────────── */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Search toggle — only visible on mobile when bar is collapsed */}
          <button
            type="button"
            onClick={() => setSearchExpanded(true)}
            className={`sm:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors touch-target ${
              searchExpanded ? 'hidden' : 'flex'
            } items-center justify-center`}
            aria-label="Open search"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowUserMenu(false);
              }}
              className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors touch-target flex items-center justify-center"
              aria-label="Notifications"
              aria-expanded={showNotifications}
              aria-haspopup="true"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800">Notifications</h3>
                </div>
                <div className="max-h-80 sm:max-h-96 overflow-y-auto">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-3 sm:p-4 border-b border-gray-100 ${getNotificationColor(notification.type)}`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm">{notification.title}</h4>
                          <p className="text-xs mt-1 opacity-80">{notification.message}</p>
                        </div>
                        <span className="text-xs opacity-60 shrink-0">{notification.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 text-center">
                  <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowNotifications(false);
              }}
              className="flex items-center gap-2 p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors touch-target"
              aria-label="User menu"
              aria-expanded={showUserMenu}
              aria-haspopup="true"
            >
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium hidden sm:block">Admin User</span>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-3 border-b border-gray-200">
                  <p className="font-medium text-gray-800">Admin User</p>
                  <p className="text-sm text-gray-600">admin@starked.com</p>
                </div>
                <div className="py-2">
                  <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 touch-target">
                    <Settings className="w-4 h-4" />
                    Settings
                  </button>
                  <button className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 touch-target">
                    <LogOut className="w-4 h-4" />
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
