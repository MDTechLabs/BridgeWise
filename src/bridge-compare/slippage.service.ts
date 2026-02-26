import { Injectable, Logger } from '@nestjs/common';
import { SlippageEstimate, RawBridgeQuote } from '../interfaces';

interface LiquidityPool {
  token: string;
  chain: string;
  tvlUsd: number;
  dailyVolumeUsd: number;
}

@Injectable()
export class SlippageService {
  private readonly logger = new Logger(SlippageService.name);

  // Simulated liquidity pool data — in production, fetched from on-chain / oracles
  private readonly MOCK_POOLS: LiquidityPool[] = [
    { token: 'USDC', chain: 'ethereum', tvlUsd: 50_000_000, dailyVolumeUsd: 10_000_000 },
    { token: 'USDC', chain: 'stellar', tvlUsd: 5_000_000, dailyVolumeUsd: 1_000_000 },
    { token: 'USDT', chain: 'ethereum', tvlUsd: 40_000_000, dailyVolumeUsd: 8_000_000 },
    { token: 'ETH', chain: 'ethereum', tvlUsd: 200_000_000, dailyVolumeUsd: 50_000_000 },
    { token: 'XLM', chain: 'stellar', tvlUsd: 2_000_000, dailyVolumeUsd: 500_000 },
  ];

  /**
   * Estimate slippage for a bridge quote based on amount vs. pool liquidity.
   */
  estimateSlippage(
    quote: RawBridgeQuote,
    sourceToken: string,
    sourceChain: string,
    amountUsd: number,
  ): SlippageEstimate {
    const pool = this.MOCK_POOLS.find(
      (p) => p.token.toUpperCase() === sourceToken.toUpperCase() && p.chain === sourceChain,
    );

    if (!pool) {
      this.logger.warn(`No liquidity data for ${sourceToken} on ${sourceChain}, using conservative estimate`);
      return this.conservativeEstimate(amountUsd);
    }

    const impactRatio = amountUsd / pool.tvlUsd;
    const expectedSlippage = this.calculatePriceImpact(impactRatio);
    const maxSlippage = expectedSlippage * 2.5;
    const confidence = this.determineConfidence(pool, amountUsd);

    return {
      expectedSlippage: parseFloat(expectedSlippage.toFixed(4)),
      maxSlippage: parseFloat(maxSlippage.toFixed(4)),
      confidence,
    };
  }

  /**
   * Batch estimate slippage across multiple quotes.
   */
  batchEstimateSlippage(
    quotes: RawBridgeQuote[],
    sourceToken: string,
    sourceChain: string,
    amountUsd: number,
  ): Map<string, SlippageEstimate> {
    const results = new Map<string, SlippageEstimate>();
    for (const quote of quotes) {
      results.set(quote.bridgeId, this.estimateSlippage(quote, sourceToken, sourceChain, amountUsd));
    }
    return results;
  }

  private calculatePriceImpact(impactRatio: number): number {
    // Approximation of constant-product AMM price impact: 1 - 1/sqrt(1 + x)
    return (1 - 1 / Math.sqrt(1 + impactRatio)) * 100;
  }

  private determineConfidence(pool: LiquidityPool, amountUsd: number): 'high' | 'medium' | 'low' {
    const ratio = amountUsd / pool.tvlUsd;
    if (ratio < 0.001) return 'high';
    if (ratio < 0.01) return 'medium';
    return 'low';
  }

  private conservativeEstimate(amountUsd: number): SlippageEstimate {
    const base = Math.min(amountUsd / 100_000, 5);
    return {
      expectedSlippage: parseFloat(base.toFixed(4)),
      maxSlippage: parseFloat((base * 2).toFixed(4)),
      confidence: 'low',
    };
  }
}
