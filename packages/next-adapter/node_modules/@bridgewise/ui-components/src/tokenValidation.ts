export interface Token {
  address: string;
  symbol: string;
  name: string;
  chainId: number;
  decimals: number;
  logoURI?: string;
}

export interface TokenValidationResult {
  isValid: boolean;
  errors: string[];
}

export function isTokenSupportedOnChain(
  token: Token,
  chainId?: number | null
): TokenValidationResult {
  if (chainId == null) {
    return { isValid: true, errors: [] };
  }

  if (token.chainId !== chainId) {
    return {
      isValid: false,
      errors: [
        `Token ${token.symbol} is not available on chain ${chainId}.`,
      ],
    };
  }

  return { isValid: true, errors: [] };
}
