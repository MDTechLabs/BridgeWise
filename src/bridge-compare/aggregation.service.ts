import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { RawBridgeQuote, BridgeProvider, QuoteRequestParams } from '../interfaces';
import { BridgeStatus } from '../enums';

interface MockQuoteTemplate {
  feesUsd: number;
  gasCostUsd: number;
  estimatedTimeSeconds: number;
  outputRatio: number; // how much of input the user gets
}

@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);

  private readonly MOCK_PROVIDERS: BridgeProvider[] = [
    {
      id: 'stargate',
      name: 'Stargate Finance',
      apiBaseUrl: 'https://api.stargate.finance',
      supportedChains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'binance', 'avalanche'],
      supportedTokens: ['USDC', 'USDT', 'ETH', 'WBTC'],
      isActive: true,
    },
    {
      id: 'squid',
      name: 'Squid Router',
      apiBaseUrl: 'https://api.0xsquid.com',
      supportedChains: ['ethereum', 'polygon', 'arbitrum', 'avalanche', 'stellar'],
      supportedTokens: ['USDC', 'USDT', 'ETH', 'XLM'],
      isActive: true,
    },
    {
      id: 'hop',
      name: 'Hop Protocol',
      apiBaseUrl: 'https://api.hop.exchange',
      supportedChains: ['ethereum', 'polygon', 'arbitrum', 'optimism'],
      supportedTokens: ['USDC', 'USDT', 'ETH', 'MATIC'],
      isActive: true,
    },
    {
      id: 'cbridge',
      name: 'cBridge',
      apiBaseUrl: 'https://cbridge-prod2.celer.app',
      supportedChains: ['ethereum', 'polygon', 'arbitrum', 'binance', 'avalanche'],
      supportedTokens: ['USDC', 'USDT', 'ETH', 'BNB'],
      isActive: true,
    },
    {
      id: 'soroswap',
      name: 'Soroswap Bridge',
      apiBaseUrl: 'https://api.soroswap.finance',
      supportedChains: ['stellar', 'ethereum'],
      supportedTokens: ['USDC', 'XLM', 'yXLM'],
      isActive: true,
    },
  ];

  private readonly MOCK_QUOTE_TEMPLATES: Record<string, MockQuoteTemplate> = {
    stargate:  { feesUsd: 0.80, gasCostUsd: 1.20, estimatedTimeSeconds: 45,  outputRatio: 0.989 },
    squid:     { feesUsd: 1.10, gasCostUsd: 0.90, estimatedTimeSeconds: 30,  outputRatio: 0.992 },
    hop:       { feesUsd: 0.60, gasCostUsd: 1.50, estimatedTimeSeconds: 120, outputRatio: 0.985 },
    cbridge:   { feesUsd: 0.70, gasCostUsd: 1.30, estimatedTimeSeconds: 90,  outputRatio: 0.987 },
    soroswap:  { feesUsd: 0.30, gasCostUsd: 0.20, estimatedTimeSeconds: 15,  outputRatio: 0.997 },
  };

  /**
   * Fetch raw quotes from all providers supporting the given route.
   * Returns an object with successful quotes and the count of failed providers.
   */
  async fetchRawQuotes(params: QuoteRequestParams): Promise<{
    quotes: RawBridgeQuote[];
    failedProviders: number;
  }> {
    const eligibleProviders = this.getEligibleProviders(params);

    if (!eligibleProviders.length) {
      throw new HttpException(
        `No bridge providers support the route ${params.sourceToken} from ${params.sourceChain} → ${params.destinationChain}`,
        HttpStatus.NOT_FOUND,
      );
    }

    this.logger.log(
      `Fetching quotes from ${eligibleProviders.length} providers for ` +
      `${params.sourceToken} ${params.sourceChain}→${params.destinationChain} amount=${params.amount}`,
    );

    const results = await Promise.allSettled(
      eligibleProviders.map((p) => this.fetchSingleProviderQuote(p, params)),
    );

    const quotes: RawBridgeQuote[] = [];
    let failedProviders = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        quotes.push(result.value);
      } else {
        failedProviders++;
        this.logger.warn(`Provider quote fetch failed: ${result.reason}`);
      }
    }

    if (!quotes.length) {
      throw new HttpException(
        'All bridge providers failed to respond. Please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { quotes, failedProviders };
  }

  /**
   * Get active providers that support the requested route.
   */
  getEligibleProviders(params: QuoteRequestParams): BridgeProvider[] {
    return this.MOCK_PROVIDERS.filter((provider) => {
      if (!provider.isActive) return false;
      const supportsSourceChain = provider.supportedChains.includes(params.sourceChain);
      const supportsDestChain = provider.supportedChains.includes(params.destinationChain);
      const supportsToken = provider.supportedTokens.some(
        (t) => t.toUpperCase() === params.sourceToken.toUpperCase(),
      );
      return supportsSourceChain && supportsDestChain && supportsToken;
    });
  }

  /**
   * Fetch a quote from a single provider (simulated; real impl uses HttpService).
   */
  private async fetchSingleProviderQuote(
    provider: BridgeProvider,
    params: QuoteRequestParams,
  ): Promise<RawBridgeQuote> {
    // Simulate occasional provider failures (5% chance)
    if (Math.random() < 0.05) {
      throw new Error(`Provider ${provider.name} returned timeout`);
    }

    const template = this.MOCK_QUOTE_TEMPLATES[provider.id] ?? {
      feesUsd: 1.00,
      gasCostUsd: 1.00,
      estimatedTimeSeconds: 60,
      outputRatio: 0.990,
    };

    // Scale fees relative to amount
    const scaledFees = template.feesUsd * (1 + Math.log10(Math.max(1, params.amount / 100)));
    const scaledGas  = template.gasCostUsd;
    const outputAmount = params.amount * template.outputRatio;

    return {
      bridgeId: provider.id,
      bridgeName: provider.name,
      outputAmount,
      feesUsd: parseFloat(scaledFees.toFixed(4)),
      gasCostUsd: parseFloat(scaledGas.toFixed(4)),
      estimatedTimeSeconds: template.estimatedTimeSeconds,
      steps: [
        {
          protocol: provider.name,
          type: 'bridge',
          inputAmount: params.amount,
          outputAmount,
          feeUsd: scaledFees,
        },
      ],
    };
  }

  getAllProviders(): BridgeProvider[] {
    return this.MOCK_PROVIDERS;
  }

  getBridgeStatus(bridgeId: string): BridgeStatus {
    const provider = this.MOCK_PROVIDERS.find((p) => p.id === bridgeId);
    if (!provider) return BridgeStatus.OFFLINE;
    return provider.isActive ? BridgeStatus.ACTIVE : BridgeStatus.OFFLINE;
  }
}
