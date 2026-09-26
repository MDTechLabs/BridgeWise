import { isServer } from './env';

/**
 * A storage wrapper that is safe to use in SSR environments.
 * All operations silently no-op on the server.
 */
export const safeStorage = {
  get(key: string): string | null {
    if (isServer) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(key: string, value: string): void {
    if (isServer) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage may be full or blocked (e.g. private browsing).
    }
  },

  remove(key: string): void {
    if (isServer) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Silently ignore.
    }
  },
};
