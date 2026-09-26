import axios from 'axios';
import { EventEmitter } from 'events';
import {
  GasPrice,
  TokenPrice,
  CrossChainPriceMatrix,
  ChainConfig,
  PriceAggregatorConfig,
  CachedPrice,
} from './types';

const DEFAULT_CONFIG: Partial<PriceAggregatorConfig> = {
  cacheTtlMs: 30_000,
  fallbackPrice: '0',
  maxRetries: 3,
  retryDelayMs: 1_000,
};

export class PriceAggregator extends EventEmitter {
  private config: PriceAggregatorConfig;
  private gasCache: Map<string, CachedPrice<GasPrice>> = new Map();
  private tokenCache: Map<string, CachedPrice<TokenPrice>> = new Map();
  private matrixCache: Map<string, CachedPrice<CrossChainPriceMatrix>> = new Map();
  private chainMap: Map<string, ChainConfig> = new Map();

  constructor(config: Partial<PriceAggregatorConfig> & { chains: ChainConfig[] }) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config } as PriceAggregatorConfig;
    for (const chain of this.config.chains) {
      this.chainMap.set(chain.chainId, chain);
    }
  }

  async getGasPrice(chainId: string): Promise<GasPrice> {
    const cached = this.gasCache.get(chainId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
    return this.fetchGasPrice(chainId);
  }

  async getTokenPrice(tokenSymbol: string, chainId: string): Promise<TokenPrice> {
    const key = `${chainId}:${tokenSymbol}`;
    const cached = this.tokenCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
    return this.fetchTokenPrice(tokenSymbol, chainId);
  }

  async getCrossChainPriceMatrix(
    sourceChainId: string,
    destinationChainId: string,
  ): Promise<CrossChainPriceMatrix> {
    const key = `${sourceChainId}:${destinationChainId}`;
    const cached = this.matrixCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
    return this.buildPriceMatrix(sourceChainId, destinationChainId);
  }

  invalidateCache(chainId?: string): void {
    if (chainId) {
      this.gasCache.delete(chainId);
      for (const key of this.tokenCache.keys()) {
        if (key.startsWith(`${chainId}:`)) {
          this.tokenCache.delete(key);
        }
      }
      for (const key of this.matrixCache.keys()) {
        if (key.startsWith(`${chainId}:`) || key.endsWith(`:${chainId}`)) {
          this.matrixCache.delete(key);
        }
      }
    } else {
      this.gasCache.clear();
      this.tokenCache.clear();
      this.matrixCache.clear();
    }
  }

  getChainConfig(chainId: string): ChainConfig | undefined {
    return this.chainMap.get(chainId);
  }

  private async fetchGasPrice(chainId: string): Promise<GasPrice> {
    const chain = this.chainMap.get(chainId);
    if (!chain) {
      throw new Error(`Unknown chain: ${chainId}`);
    }

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const gasPrice = await this.queryGasPrice(chain);
        this.gasCache.set(chainId, {
          data: gasPrice,
          cachedAt: Date.now(),
          expiresAt: Date.now() + this.config.cacheTtlMs,
        });
        this.emit('gas-price-updated', { chainId, gasPrice });
        return gasPrice;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.emit('fetch-error', { chainId, attempt, error: message });
        if (attempt < this.config.maxRetries - 1) {
          await this.delay(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }

    return this.getFallbackGasPrice(chainId);
  }

  private async fetchTokenPrice(tokenSymbol: string, chainId: string): Promise<TokenPrice> {
    const chain = this.chainMap.get(chainId);
    if (!chain) {
      throw new Error(`Unknown chain: ${chainId}`);
    }

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const tokenPrice = await this.queryTokenPrice(tokenSymbol, chain);
        const key = `${chainId}:${tokenSymbol}`;
        this.tokenCache.set(key, {
          data: tokenPrice,
          cachedAt: Date.now(),
          expiresAt: Date.now() + this.config.cacheTtlMs,
        });
        this.emit('token-price-updated', { chainId, tokenSymbol, tokenPrice });
        return tokenPrice;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.emit('fetch-error', { chainId, tokenSymbol, attempt, error: message });
        if (attempt < this.config.maxRetries - 1) {
          await this.delay(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }

    return this.getFallbackTokenPrice(tokenSymbol, chainId);
  }

  private async buildPriceMatrix(
    sourceChainId: string,
    destinationChainId: string,
  ): Promise<CrossChainPriceMatrix> {
    const [sourceGas, destGas, sourceToken, destToken] = await Promise.all([
      this.getGasPrice(sourceChainId),
      this.getGasPrice(destinationChainId),
      this.getNativeTokenPrice(sourceChainId),
      this.getNativeTokenPrice(destinationChainId),
    ]);

    const sourceUsd = parseFloat(sourceToken.usdPrice);
    const destUsd = parseFloat(destToken.usdPrice);
    const exchangeRate = sourceUsd > 0 ? (destUsd / sourceUsd).toFixed(6) : this.config.fallbackPrice;

    const matrix: CrossChainPriceMatrix = {
      sourceChainId,
      destinationChainId,
      sourceGasPrice: sourceGas,
      destinationGasPrice: destGas,
      exchangeRate,
      timestamp: Date.now(),
    };

    const key = `${sourceChainId}:${destinationChainId}`;
    this.matrixCache.set(key, {
      data: matrix,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.config.cacheTtlMs,
    });

    this.emit('price-matrix-updated', matrix);
    return matrix;
  }

  private async queryGasPrice(chain: ChainConfig): Promise<GasPrice> {
    switch (chain.chainType) {
      case 'evm':
        return this.queryEvmGasPrice(chain);
      case 'soroban':
        return this.querySorobanGasPrice(chain);
      case 'solana':
        return this.querySolanaGasPrice(chain);
      default:
        throw new Error(`Unsupported chain type: ${chain.chainType}`);
    }
  }

  private async queryEvmGasPrice(chain: ChainConfig): Promise<GasPrice> {
    const response = await axios.post(
      chain.rpcUrl,
      {
        jsonrpc: '2.0',
        method: 'eth_gasPrice',
        params: [],
        id: 1,
      },
      { timeout: 10_000 },
    );
    const hexGas = response.data.result;
    const baseFee = BigInt(hexGas).toString();

    const feeHistory = await axios.post(
      chain.rpcUrl,
      {
        jsonrpc: '2.0',
        method: 'eth_feeHistory',
        params: ['0x1', 'latest', [25, 50, 75]],
        id: 2,
      },
      { timeout: 10_000 },
    );
    const reward = feeHistory.data.result?.reward?.[0]?.[1] || '0x0';
    const priorityFee = BigInt(reward).toString();

    return {
      chainId: chain.chainId,
      baseFee,
      priorityFee,
      maxFee: (BigInt(baseFee) * 2n + BigInt(priorityFee)).toString(),
      estimatedSeconds: 15,
      timestamp: Date.now(),
    };
  }

  private async querySorobanGasPrice(chain: ChainConfig): Promise<GasPrice> {
    const response = await axios.get(
      `${chain.rpcUrl.replace(/\/$/, '')}/fee_stats`,
      { timeout: 10_000 },
    );
    const stats = response.data;
    return {
      chainId: chain.chainId,
      baseFee: stats?.base_fee_in_stroops || stats?.baseFee || '100',
      priorityFee: stats?.surge_fee_in_stroops || stats?.surgeFee || '1000',
      maxFee: stats?.max_fee || stats?.maxFee || '10000',
      estimatedSeconds: stats?.estimated_seconds || 5,
      timestamp: Date.now(),
    };
  }

  private async querySolanaGasPrice(chain: ChainConfig): Promise<GasPrice> {
    const response = await axios.post(
      chain.rpcUrl,
      {
        jsonrpc: '2.0',
        method: 'getRecentPerformanceSamples',
        params: [1],
        id: 1,
      },
      { timeout: 10_000 },
    );
    const sample = response.data.result?.[0];
    const cuPerSlot = sample ? sample.numTransactions * sample.samplePeriodSecs : 0;
    const priorityFee = cuPerSlot > 0 ? Math.ceil(5000 / cuPerSlot).toString() : '5000';

    return {
      chainId: chain.chainId,
      baseFee: sample?.cuPerSlot?.toString() || '5000',
      priorityFee,
      maxFee: (BigInt(priorityFee) * 3n).toString(),
      estimatedSeconds: sample?.samplePeriodSecs || 10,
      timestamp: Date.now(),
    };
  }

  private async queryTokenPrice(tokenSymbol: string, chain: ChainConfig): Promise<TokenPrice> {
    const endpoint = chain.priceFeedEndpoint || 'https://api.coingecko.com/api/v3';
    const response = await axios.get(
      `${endpoint}/simple/price?ids=${tokenSymbol}&vs_currencies=usd&include_24hr_change=true`,
      { timeout: 10_000 },
    );
    const data = response.data[tokenSymbol];
    if (!data) {
      throw new Error(`No price data for ${tokenSymbol} on ${chain.chainId}`);
    }
    return {
      tokenSymbol,
      tokenAddress: '',
      chainId: chain.chainId,
      usdPrice: String(data.usd || '0'),
      usdPrice24hChange: String(data.usd_24h_change || '0'),
      timestamp: Date.now(),
    };
  }

  private async getNativeTokenPrice(chainId: string): Promise<TokenPrice> {
    return this.getTokenPrice(chainId, chainId);
  }

  private getFallbackGasPrice(chainId: string): GasPrice {
    const fallback: GasPrice = {
      chainId,
      baseFee: '0',
      priorityFee: '0',
      maxFee: '0',
      estimatedSeconds: 999,
      timestamp: Date.now(),
    };
    this.emit('fallback-used', { type: 'gas', chainId, fallback });
    return fallback;
  }

  private getFallbackTokenPrice(tokenSymbol: string, chainId: string): TokenPrice {
    const fallback: TokenPrice = {
      tokenSymbol,
      tokenAddress: '',
      chainId,
      usdPrice: '0',
      usdPrice24hChange: '0',
      timestamp: Date.now(),
    };
    this.emit('fallback-used', { type: 'token', chainId, tokenSymbol, fallback });
    return fallback;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
