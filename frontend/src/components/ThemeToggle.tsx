'use client';

import React from 'react';
import { useTheme } from '@/context/ThemeContext';

interface ThemeToggleProps {
  className?: string;
  iconOnly?: boolean;
}

export function ThemeToggle({ className = '', iconOnly = false }: ThemeToggleProps) {
  const { isDark, toggleTheme, resolvedTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`
        relative inline-flex items-center justify-center rounded-lg
        transition-all duration-300 ease-in-out
        hover:scale-105 active:scale-95
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        dark:focus:ring-offset-slate-900
        ${iconOnly
          ? 'p-2 w-10 h-10'
          : 'px-3 py-2 gap-2'
        }
        text-gray-700 dark:text-gray-200
        bg-gray-100 dark:bg-slate-800
        hover:bg-gray-200 dark:hover:bg-slate-700
        border border-gray-200 dark:border-slate-700
        ${className}
      `}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {/* Sun icon */}
      <svg
        className={`
          h-5 w-5 transition-all duration-500 ease-in-out
          ${isDark ? 'opacity-0 scale-0 rotate-90 absolute' : 'opacity-100 scale-100 rotate-0'}
        `}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
        />
      </svg>

      {/* Moon icon */}
      <svg
        className={`
          h-5 w-5 transition-all duration-500 ease-in-out
          ${isDark ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-0 rotate-90 absolute'}
        `}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
        />
      </svg>

      {!iconOnly && (
        <span className="text-sm font-medium">
          {isDark ? 'Dark' : 'Light'}
        </span>
      )}
    </button>
  );
}

export default ThemeToggle;
