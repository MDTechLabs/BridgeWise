import { useMemo } from 'react';
import { isTokenSupported } from '../../tokenValidation';

export interface BridgeValidationResult {
  isValid: boolean;
  errors: string[];
  tokenInfo?: any;
}

export function useBridgeValidation(
  token: string,
  sourceChain: string,
  destinationChain: string
): BridgeValidationResult {
  return useMemo(
    () => isTokenSupported(token, sourceChain, destinationChain),
    [token, sourceChain, destinationChain]
  );
}
