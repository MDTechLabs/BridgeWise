import { TOKEN_REGISTRY, TokenInfo } from './tokenRegistry';

export interface TokenValidationResult {
  isValid: boolean;
  errors: string[];
  tokenInfo?: TokenInfo;
}

export function isTokenSupported(
  symbol: string,
  sourceChain: string,
  destinationChain: string
): TokenValidationResult {
  const token = TOKEN_REGISTRY.find(
    (t) => t.symbol === symbol && t.chain.toLowerCase() === sourceChain.toLowerCase()
  );
  if (!token) {
    return {
      isValid: false,
      errors: [`Token ${symbol} not found on source chain ${sourceChain}`],
    };
  }
  if (!token.bridgeSupported.map((c) => c.toLowerCase()).includes(destinationChain.toLowerCase())) {
    return {
      isValid: false,
      errors: [`Token ${symbol} is not supported for bridging from ${sourceChain} to ${destinationChain}`],
      tokenInfo: token,
    };
  }
  return { isValid: true, errors: [], tokenInfo: token };
}
