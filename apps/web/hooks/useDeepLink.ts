import { useState, useEffect } from 'react';
import {
  parseBridgeDeepLink,
  serializeBridgeDeepLink,
  type BridgeDeepLinkParams,
} from '../utils/deep-link';

export interface UseDeepLinkReturn {
  params: BridgeDeepLinkParams;
  updateParams: (updates: Partial<BridgeDeepLinkParams>) => void;
  shareableUrl: string;
}

/**
 * Hook that reads bridge params from the current URL and keeps them in sync.
 * Works in both browser and SSR environments.
 */
export function useDeepLink(): UseDeepLinkReturn {
  const [params, setParams] = useState<BridgeDeepLinkParams>(() => {
    if (typeof window === 'undefined') return {};
    return parseBridgeDeepLink(window.location.search);
  });

  // Re-parse on popstate (browser back/forward)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePop = () => {
      setParams(parseBridgeDeepLink(window.location.search));
    };

    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const updateParams = (updates: Partial<BridgeDeepLinkParams>) => {
    setParams((prev) => {
      const next = { ...prev, ...updates };
      if (typeof window !== 'undefined') {
        const qs = serializeBridgeDeepLink(next);
        const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
        window.history.replaceState(null, '', newUrl);
      }
      return next;
    });
  };

  const shareableUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?${serializeBridgeDeepLink(params)}`
      : '';

  return { params, updateParams, shareableUrl };
}
