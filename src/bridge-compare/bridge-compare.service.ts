import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AggregationService } from './aggregation.service';
import { SlippageService } from './slippage.service';
import { ReliabilityService } from './reliability.service';
import { RankingService } from './ranking.service';
import { GetQuotesDto } from './dto';
import { NormalizedQuote, QuoteResponse, QuoteRequestParams, RawBridgeQuote } from './interfaces';
import { BridgeStatus, RankingMode } from './enums';

@Injectable()
export class BridgeCompareService {
  private readonly logger = new Logger(BridgeCompareService.name);

  constructor(
    private readonly aggregationService: AggregationService,
    private readonly slippageService: SlippageService,
    private readonly reliabilityService: ReliabilityService,
    private readonly rankingService: RankingService,
  ) {}

  /**
   * Get all normalized, ranked quotes for a bridge request.
   */
  async getQuotes(dto: GetQuotesDto): Promise<QuoteResponse> {
    const startTime = Date.now();
    const params: QuoteRequestParams = {
      sourceChain: dto.sourceChain,
      destinationChain: dto.destinationChain,
      sourceToken: dto.sourceToken,
      destinationToken: dto.destinationToken ?? dto.sourceToken,
      amount: dto.amount,
      rankingMode: dto.rankingMode ?? RankingMode.BALANCED,
      slippageTolerance: dto.slippageTolerance,
    };

    this.logger.log(
      `Getting quotes: ${dto.sourceToken} ${dto.sourceChain}→${dto.destinationChain} ` +
      `amount=${dto.amount} mode=${params.rankingMode}`,
    );

    const { quotes: rawQuotes, failedProviders } = await this.aggregationService.fetchRawQuotes(params);

    const slippageMap = this.slippageService.batchEstimateSlippage(
      rawQuotes,
      dto.sourceToken,
      dto.sourceChain,
      dto.amount,
    );

    const bridgeIds = rawQuotes.map((q) => q.bridgeId);
    const reliabilityMap = this.reliabilityService.batchCalculateScores(bridgeIds);

    const normalizedQuotes: NormalizedQuote[] = rawQuotes.map((raw) =>
      this.normalizeQuote(raw, params, slippageMap, reliabilityMap),
    );

    const rankedQuotes = this.rankingService.rankQuotes(normalizedQuotes, params.rankingMode);

    const bestRoute = rankedQuotes[0];
    if (!bestRoute) {
      throw new NotFoundException('No valid routes found for the requested pair');
    }

    const response: QuoteResponse = {
      quotes: rankedQuotes,
      bestRoute,
      rankingMode: params.rankingMode,
      requestParams: params,
      totalProviders: rawQuotes.length + failedProviders,
      successfulProviders: rawQuotes.length,
      fetchDurationMs: Date.now() - startTime,
    };

    this.logger.log(
      `Returned ${rankedQuotes.length} quotes in ${response.fetchDurationMs}ms. ` +
      `Best: ${bestRoute.bridgeName} score=${bestRoute.compositeScore}`,
    );

    return response;
  }

  /**
   * Get a specific route's full details by bridgeId.
   */
  async getRouteDetails(dto: GetQuotesDto, bridgeId: string): Promise<NormalizedQuote> {
    const response = await this.getQuotes(dto);
    const route = response.quotes.find((q) => q.bridgeId === bridgeId);

    if (!route) {
      throw new NotFoundException(`Route not found for bridge: ${bridgeId}`);
    }

    return route;
  }

  /**
   * Get list of all supported bridges.
   */
  getSupportedBridges() {
    return this.aggregationService.getAllProviders();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private normalizeQuote(
    raw: RawBridgeQuote,
    params: QuoteRequestParams,
    slippageMap: Map<string, { expectedSlippage: number }>,
    reliabilityMap: Map<string, number>,
  ): NormalizedQuote {
    const totalFeeUsd = raw.feesUsd + raw.gasCostUsd;
    const slippage = slippageMap.get(raw.bridgeId);
    const reliabilityScore = reliabilityMap.get(raw.bridgeId) ?? 70;
    const bridgeStatus = this.aggregationService.getBridgeStatus(raw.bridgeId);

    return {
      bridgeId: raw.bridgeId,
      bridgeName: raw.bridgeName,
      sourceChain: params.sourceChain,
      destinationChain: params.destinationChain,
      sourceToken: params.sourceToken,
      destinationToken: params.destinationToken ?? params.sourceToken,
      inputAmount: params.amount,
      outputAmount: parseFloat(raw.outputAmount.toFixed(6)),
      totalFeeUsd: parseFloat(totalFeeUsd.toFixed(4)),
      estimatedTimeSeconds: raw.estimatedTimeSeconds,
      slippagePercent: slippage?.expectedSlippage ?? 0,
      reliabilityScore,
      compositeScore: 0,     // assigned by RankingService
      rankingPosition: 0,    // assigned by RankingService
      bridgeStatus,
      metadata: {
        feesBreakdown: { protocolFee: raw.feesUsd, gasFee: raw.gasCostUsd },
        steps: raw.steps,
      },
      fetchedAt: new Date(),
    };
  }
}
