'use client';

import { type ReactNode } from 'react';
import { useIsClient } from '../../ssr-hooks/useIsClient';

export interface ClientOnlyProps {
  /** Content rendered only after client-side hydration. */
  children: ReactNode;
  /** Optional fallback rendered during SSR / before hydration. */
  fallback?: ReactNode;
}

/**
 * Renders its children only on the client.
 * During SSR (and the first client render) the `fallback` is shown instead.
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const isClient = useIsClient();
  return <>{isClient ? children : fallback}</>;
}
