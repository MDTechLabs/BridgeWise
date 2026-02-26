import { Injectable, Logger } from '@nestjs/common';
import { BridgeRegistryService } from './bridge-registry.service';
import { QuoteScoringService, RankStrategy } from './quote-scoring.service';
import {
  BridgeAdapter,
  NormalizedQuote,
  QuoteRequest,
} from '../interfaces/bridge-adapter.interface';
import { CompareQuotesResponseDto } from '../dto/get-quotes.dto';

export const QUOTE_TIMEOUT_MS = 10_000;

@Injectable()
export class FeeAggregationService {
  private readonly logger = new Logger(FeeAggregationService.name);

  constructor(
    private readonly registry: BridgeRegistryService,
    private readonly scoring: QuoteScoringService,
  ) {}

  async compareQuotes(
    request: QuoteRequest,
    rankBy: RankStrategy = 'score',
  ): Promise<CompareQuotesResponseDto> {
    const adapters = this.registry.listAdapters();

    if (adapters.length === 0) {
      this.logger.warn('No bridge adapters registered');
    }

    const quotes = await this.fetchAllQuotes(adapters, request);
    const ranked = this.scoring.scoreAndRank(quotes, rankBy);

    return {
      fromChain: request.fromChain,
      toChain: request.toChain,
      token: request.token,
      amount: request.amount,
      fetchedAt: new Date().toISOString(),
      quotes: ranked,
    };
  }

  private async fetchAllQuotes(
    adapters: BridgeAdapter[],
    request: QuoteRequest,
  ): Promise<NormalizedQuote[]> {
    const results = await Promise.allSettled(
      adapters.map((adapter) => this.fetchSingleQuote(adapter, request)),
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      const adapterName = adapters[index].name;
      this.logger.error(
        `Failed to fetch quote from "${adapterName}": ${result.reason?.message}`,
      );

      return {
        bridgeName: adapterName,
        totalFeeUSD: 0,
        feeToken: '',
        estimatedArrivalTime: 0,
        outputAmount: '0',
        supported: false,
        error: result.reason?.message ?? 'Unknown error',
      };
    });
  }

  private async fetchSingleQuote(
    adapter: BridgeAdapter,
    request: QuoteRequest,
  ): Promise<NormalizedQuote> {
    // Check route support before querying
    if (!adapter.supportsRoute(request.fromChain, request.toChain, request.token)) {
      return {
        bridgeName: adapter.name,
        totalFeeUSD: 0,
        feeToken: request.token,
        estimatedArrivalTime: 0,
        outputAmount: '0',
        supported: false,
        error: `Route ${request.fromChain}→${request.toChain} not supported for ${request.token}`,
      };
    }

    return Promise.race([
      adapter.getQuote(request),
      this.timeoutReject(adapter.name),
    ]);
  }

  private timeoutReject(adapterName: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout fetching quote from "${adapterName}" after ${QUOTE_TIMEOUT_MS}ms`)),
        QUOTE_TIMEOUT_MS,
      ),
    );
  }
}
