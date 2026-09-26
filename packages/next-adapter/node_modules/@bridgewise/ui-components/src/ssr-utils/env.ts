/**
 * Environment detection utilities for SSR compatibility.
 */

/** Returns `true` when running on the server (no `window` global). */
export const isServer = typeof window === 'undefined';

/** Returns `true` when running in a browser environment. */
export const isClient = !isServer;
