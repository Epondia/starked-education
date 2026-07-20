'use client';

import React, { useState } from 'react';
import { Bell, Search, User, Settings, LogOut } from 'lucide-react';

interface AdminHeaderProps {
  title?: string;
}

export default function AdminHeader({ title = 'Dashboard' }: AdminHeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const notifications = [
    { id: 1, title: 'New user registration', message: '5 new users registered today', time: '2m ago', type: 'info' },
    { id: 2, title: 'System update', message: 'Platform maintenance scheduled', time: '1h ago', type: 'warning' },
    { id: 3, title: 'Content flagged', message: '3 courses need moderation', time: '3h ago', type: 'alert' }
  ];

  const unreadCount = notifications.length;

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
        {/* Page Title — displayed in header bar, not a structural heading (page provides its own h1) */}
        <div>
          <p className="text-2xl font-semibold text-gray-800">{title}</p>
          <p className="text-sm text-gray-600 mt-1">Manage your StarkEd platform</p>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5"
              aria-hidden="true"
            />
            {/*
             * Visually hidden label associates the input with an accessible name.
             * WCAG 2.1 SC 1.3.1 (Info and Relationships) and SC 4.1.2 (Name, Role, Value)
             */}
            <label htmlFor="admin-search" className="sr-only">
              Search users, courses, or content
            </label>
            <input
              id="admin-search"
              type="search"
              placeholder="Search users, courses, or content..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowUserMenu(false);
              }}
              className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label={showNotifications
                ? 'Close notifications'
                : `Open notifications (${unreadCount} unread)`
              }
              aria-expanded={showNotifications}
              aria-haspopup="true"
              aria-controls="notifications-panel"
            >
              <Bell className="w-5 h-5" aria-hidden="true" />
              {/* Unread badge — sr-only text makes it meaningful to screen readers */}
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" />
              <span className="sr-only">{unreadCount} unread notifications</span>
            </button>

            {showNotifications && (
              <div
                id="notifications-panel"
                role="region"
                aria-label="Notifications panel"
                className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
              >
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800">Notifications</h3>
                </div>
                <ul className="max-h-96 overflow-y-auto" aria-label="Notification list">
                  {notifications.map(notification => (
                    <li
                      key={notification.id}
                      className={`p-4 border-b border-gray-100 ${getNotificationColor(notification.type)}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{notification.title}</p>
                          <p className="text-xs mt-1 opacity-80">{notification.message}</p>
                        </div>
                        <time className="text-xs opacity-60 ml-2" dateTime={notification.time}>
                          {notification.time}
                        </time>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="p-3 text-center">
                  <button
                    type="button"
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
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
              className="flex items-center gap-2 p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label={showUserMenu ? 'Close user menu' : 'Open user menu for Admin User'}
              aria-expanded={showUserMenu}
              aria-haspopup="true"
              aria-controls="user-menu-panel"
            >
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center" aria-hidden="true">
                <User className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <span className="font-medium">Admin User</span>
            </button>

            {showUserMenu && (
              <div
                id="user-menu-panel"
                role="menu"
                aria-label="User menu"
                className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
              >
                <div className="p-3 border-b border-gray-200" role="none">
                  <p className="font-medium text-gray-800">Admin User</p>
                  <p className="text-sm text-gray-600">admin@starked.com</p>
                </div>
                <div className="py-2" role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" aria-hidden="true" />
                    Settings
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
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
