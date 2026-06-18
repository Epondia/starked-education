'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';

type ThemeMode = 'system' | 'light' | 'dark';

const themeCycle: ThemeMode[] = ['system', 'light', 'dark'];

const themeIcons: Record<ThemeMode, React.ElementType> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const themeLabels: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center"
        aria-label="Toggle theme"
      >
        <span className="w-4 h-4" />
      </button>
    );
  }

  const currentMode: ThemeMode = (theme as ThemeMode) || 'system';
  const Icon = themeIcons[currentMode];

  const handleToggle = () => {
    const currentIndex = themeCycle.indexOf(currentMode);
    const nextIndex = (currentIndex + 1) % themeCycle.length;
    setTheme(themeCycle[nextIndex]);
  };

  return (
    <button
      onClick={handleToggle}
      className="relative w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      aria-label={`Current theme: ${themeLabels[currentMode]}. Click to switch.`}
      title={`Theme: ${themeLabels[currentMode]}`}
    >
      <Icon className="h-4 w-4 text-gray-700 dark:text-gray-300" />
      <span className="sr-only">Theme: {themeLabels[currentMode]}</span>
    </button>
  );
}
