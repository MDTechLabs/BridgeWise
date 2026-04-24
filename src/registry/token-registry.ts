/**
 * Token Metadata Registry
 * Central registry for token info across chains.
 */

export interface TokenMetadata {
  /** Token symbol, e.g. "USDC" */
  symbol: string;
  /** Human-readable name */
  name: string;
  /** Number of decimals */
  decimals: number;
  /** Optional logo URI */
  logoURI?: string;
  /** Contract addresses keyed by numeric chain ID */
  addresses: Record<number, string>;
}

export class TokenRegistry {
  private tokens: Map<string, TokenMetadata> = new Map();

  /**
   * Register a token. Key is the uppercased symbol.
   */
  register(token: TokenMetadata): void {
    if (!token.symbol) throw new Error('Token symbol is required');
    this.tokens.set(token.symbol.toUpperCase(), token);
  }

  registerBatch(tokens: TokenMetadata[]): void {
    for (const token of tokens) {
      this.register(token);
    }
  }

  /** Look up by symbol */
  get(symbol: string): TokenMetadata | undefined {
    return this.tokens.get(symbol.toUpperCase());
  }

  /** Get contract address for a specific chain */
  getAddress(symbol: string, chainId: number): string | undefined {
    return this.get(symbol)?.addresses[chainId];
  }

  /** Normalize decimals: convert raw amount to human-readable */
  toHuman(symbol: string, rawAmount: bigint): string {
    const token = this.get(symbol);
    if (!token) throw new Error(`Unknown token: ${symbol}`);
    const divisor = BigInt(10) ** BigInt(token.decimals);
    const whole = rawAmount / divisor;
    const frac = rawAmount % divisor;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(token.decimals, '0').replace(/0+$/, '');
    return `${whole}.${fracStr}`;
  }

  getAll(): TokenMetadata[] {
    return Array.from(this.tokens.values());
  }

  has(symbol: string): boolean {
    return this.tokens.has(symbol.toUpperCase());
  }

  size(): number {
    return this.tokens.size;
  }
}

/** Default registry pre-loaded with common tokens */
export const defaultTokenRegistry = new TokenRegistry();

defaultTokenRegistry.registerBatch([
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png',
    addresses: {
      1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',   // Ethereum
      137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Polygon
      56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',  // BSC
    },
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
    addresses: {
      1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    },
  },
  {
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    addresses: {
      1: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
  },
  {
    symbol: 'XLM',
    name: 'Stellar Lumens',
    decimals: 7,
    addresses: {},
  },
]);
