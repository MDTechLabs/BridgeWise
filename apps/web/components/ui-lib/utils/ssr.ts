/**
 * SSR-safe utilities for BridgeWise components
 */

import { useState, useEffect } from 'react';

/**
 * Check if code is running in browser environment
 */
export const isBrowser = typeof window !== 'undefined';

/**
 * Check if code is running in server environment
 */
export const isServer = !isBrowser;

/**
 * SSR-safe localStorage operations
 */
export const ssrLocalStorage = {
  getItem: (key: string): string | null => {
    if (!isBrowser) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  
  setItem: (key: string, value: string): void => {
    if (!isBrowser) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Silently fail in server environment
    }
  },
  
  removeItem: (key: string): void => {
    if (!isBrowser) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Silently fail in server environment
    }
  }
};

/**
 * SSR-safe window operations
 */
export const ssrWindow = {
  getScrollY: (): number => {
    if (!isBrowser) return 0;
    return window.scrollY;
  },
  
  addEventListener: (event: string, handler: EventListener): void => {
    if (!isBrowser) return;
    window.addEventListener(event, handler);
  },
  
  removeEventListener: (event: string, handler: EventListener): void => {
    if (!isBrowser) return;
    window.removeEventListener(event, handler);
  }
};

/**
 * Hook to detect if component is mounted (client-side)
 */
export const useIsMounted = (): boolean => {
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);
  
  return isMounted;
};
