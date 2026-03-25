// Centralized token registry for BridgeWise
export interface TokenInfo {
  symbol: string;
  name: string;
  chain: string;
  bridgeSupported: string[];
  decimals: number;
  logoURI?: string;
}

// Example registry (expand as needed)
export const TOKEN_REGISTRY: TokenInfo[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chain: 'Ethereum',
    bridgeSupported: ['Stellar', 'Polygon'],
    decimals: 6,
    logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chain: 'Stellar',
    bridgeSupported: ['Ethereum'],
    decimals: 7,
    logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
  },
  // Add more tokens and chains as needed
];
