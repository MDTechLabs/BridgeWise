import { useMemo } from 'react';
import { isTokenSupported } from './tokenValidation';

export function useTokenValidation(
  symbol: string,
  sourceChain: string,
  destinationChain: string
) {
  // SSR-safe: no window/document usage
  const result = useMemo(
    () => isTokenSupported(symbol, sourceChain, destinationChain),
    [symbol, sourceChain, destinationChain]
  );
  return result;
}
