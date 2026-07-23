'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
  isSystemPreference: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'starked-theme-preference';
const DARK_CLASS = 'dark';

function getSystemPreference(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme | 'system' {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add(DARK_CLASS);
  } else {
    root.classList.remove(DARK_CLASS);
  }
  // Update color-scheme for native browser elements
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [storedTheme, setStoredTheme] = useState<Theme | 'system'>(getStoredTheme);
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemPreference);
  const [mounted, setMounted] = useState(false);

  // Determine the resolved (actual) theme
  const resolvedTheme: Theme = storedTheme === 'system' ? systemTheme : storedTheme;
  const isSystemPreference = storedTheme === 'system';
  const isDark = resolvedTheme === 'dark';

  // Apply theme to DOM
  useEffect(() => {
    applyTheme(resolvedTheme);
    setMounted(true);
  }, [resolvedTheme]);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    // Modern browsers
    mediaQuery.addEventListener('change', handleChange);

    // Set initial value
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // Persist theme preference
  const persistTheme = useCallback((theme: Theme | 'system') => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // localStorage not available (private browsing, etc.)
    }
  }, []);

  const setTheme = useCallback((theme: Theme) => {
    setStoredTheme(theme);
    persistTheme(theme);
  }, [persistTheme]);

  const toggleTheme = useCallback(() => {
    // If currently using system preference, switch to explicit opposite
    // If using explicit theme, toggle it
    const nextTheme: Theme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setStoredTheme(nextTheme);
    persistTheme(nextTheme);
  }, [resolvedTheme, persistTheme]);

  // Prevent flash of wrong theme by setting class before hydration
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ThemeContext.Provider
      value={{
        theme: storedTheme === 'system' ? 'light' : storedTheme, // The explicitly set theme
        resolvedTheme,
        setTheme,
        toggleTheme,
        isDark,
        isSystemPreference,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;
