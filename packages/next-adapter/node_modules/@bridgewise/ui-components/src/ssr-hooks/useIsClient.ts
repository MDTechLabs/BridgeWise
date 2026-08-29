'use client';

import { useState, useEffect } from 'react';

/**
 * Returns `true` once the component has mounted on the client.
 * Useful for guarding browser-only code inside components.
 */
export function useIsClient(): boolean {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
}
