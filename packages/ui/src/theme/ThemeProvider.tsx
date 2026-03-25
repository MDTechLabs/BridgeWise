/**
 * ThemeProvider Component
 * Core provider for BridgeWise theming system
 * Manages theme state, dark mode, and CSS variable injection
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { mergeTheme } from './utils/merge-theme';
import { generateCSSVariables } from './utils/css-vars';
import { defaultTheme, darkTheme } from './tokens';
import type { Theme, ThemeMode, ThemeContextValue, DeepPartial } from './types';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export interface ThemeProviderProps {
  children: React.ReactNode;
  /**
   * Custom theme configuration to merge with defaults
   */
  theme?: DeepPartial<Theme>;
  /**
   * Initial theme mode (light/dark/system)
   * @default 'system'
   */
  defaultMode?: ThemeMode;
  /**
   * Storage key for persisting theme preference
   * @default 'bridgewise-theme-mode'
   */
  storageKey?: string;
  /**
   * Enable/disable system theme detection
   * @default true
   */
  enableSystem?: boolean;
  /**
   * Disable all transitions during theme switch
   * @default true
   */
  disableTransitionOnChange?: boolean;
  /**
   * Custom attribute to set on root element
   * @default 'data-theme'
   */
  attribute?: 'class' | 'data-theme';
  /**
   * Value to set for dark mode
   * @default 'dark'
   */
  darkValue?: string;
  /**
   * Value to set for light mode
   * @default 'light'
   */
  lightValue?: string;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  theme: customTheme,
  defaultMode = 'system',
  storageKey = 'bridgewise-theme-mode',
  enableSystem = true,
  disableTransitionOnChange = true,
  attribute = 'data-theme',
  darkValue = 'dark',
  lightValue = 'light',
}) => {
  const [mode, setModeState] = useState<ThemeMode>(defaultMode);
  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  // Merge custom theme with defaults
  const mergedTheme = useMemo(() => {
    const baseTheme = customTheme ? mergeTheme(defaultTheme, customTheme) : defaultTheme;
    const themeWithMode = resolvedMode === 'dark'
      ? mergeTheme(baseTheme, darkTheme)
      : baseTheme;
    return themeWithMode;
  }, [customTheme, resolvedMode]);

  // Initialize theme from storage/system on mount
  useEffect(() => {
    setMounted(true);

    // Load from storage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey);
      if (stored && ['light', 'dark', 'system'].includes(stored)) {
        setModeState(stored as ThemeMode);
      }
    }
  }, [storageKey]);

  // Handle system preference changes
  useEffect(() => {
    if (!enableSystem || !mounted) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const updateResolvedMode = () => {
      if (mode === 'system') {
        setResolvedMode(mediaQuery.matches ? 'dark' : 'light');
      } else {
        setResolvedMode(mode as 'light' | 'dark');
      }
    };

    updateResolvedMode();

    // Listen for system changes
    mediaQuery.addEventListener('change', updateResolvedMode);
    return () => mediaQuery.removeEventListener('change', updateResolvedMode);
  }, [mode, enableSystem, mounted]);

  // Apply theme to DOM
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;

    // Disable transitions temporarily
    if (disableTransitionOnChange) {
      const css = document.createElement('style');
      css.textContent = '* { transition: none !important; }';
      document.head.appendChild(css);

      // Force reflow
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.head.removeChild(css);
        });
      });
    }

    // Set theme attribute
    if (attribute === 'class') {
      root.classList.remove(lightValue, darkValue);
      root.classList.add(resolvedMode === 'dark' ? darkValue : lightValue);
    } else {
      root.setAttribute(attribute, resolvedMode === 'dark' ? darkValue : lightValue);
    }

    // Generate and inject CSS variables
    const cssVars = generateCSSVariables(mergedTheme);
    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

  }, [resolvedMode, mergedTheme, mounted, attribute, darkValue, lightValue, disableTransitionOnChange]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, newMode);
    }
  }, [storageKey]);

  const toggleMode = useCallback(() => {
    setMode(mode === 'light' ? 'dark' : mode === 'dark' ? 'light' : 'light');
  }, [mode, setMode]);

  const value: ThemeContextValue = useMemo(() => ({
    theme: mergedTheme,
    mode: resolvedMode,
    setMode,
    toggleMode,
  }), [mergedTheme, resolvedMode, setMode, toggleMode]);

  // Prevent flash on SSR
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook to access theme context
 * @throws Error if used outside ThemeProvider
 */
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
