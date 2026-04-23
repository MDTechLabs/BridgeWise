import { Injectable, Logger } from '@nestjs/common';

export interface ProviderFeeQuote {
  provider: string;
  fromChain: number;
  toChain: number;
  token: string;
  amount: number;
  gasFeeUSD: number;
  protocolFeeUSD: number;
  totalFeeUSD: number;
  outputAmount: number;
  estimatedTimeSeconds: number;
}

export interface FeeComparisonResult {
  quotes: RankedFeeQuote[];
  cheapest: RankedFeeQuote;
  fastest: RankedFeeQuote;
  fromChain: number;
  toChain: number;
  token: string;
  amount: number;
  generatedAt: Date;
}

export interface RankedFeeQuote extends ProviderFeeQuote {
  rank: number;
  savingsVsWorstUSD: number;
}

type FeeSource = (
  fromChain: number,
  toChain: number,
  token: string,
  amount: number,
) => Promise<ProviderFeeQuote | null>;

@Injectable()
export class FeeEngine {
  private readonly logger = new Logger(FeeEngine.name);
  private readonly sources = new Map<string, FeeSource>();

  registerSource(name: string, fn: FeeSource): void {
    this.sources.set(name, fn);
    this.logger.log(`Fee source registered: ${name}`);
  }

  async compare(
    fromChain: number,
    toChain: number,
    token: string,
    amount: number,
  ): Promise<FeeComparisonResult> {
    const raw = await Promise.all(
      Array.from(this.sources.entries()).map(async ([, fn]) => {
        try {
          return await fn(fromChain, toChain, token, amount);
        } catch (err) {
          this.logger.warn(`Fee source error: ${err}`);
          return null;
        }
      }),
    );

    const valid = raw.filter((q): q is ProviderFeeQuote => q !== null && q.totalFeeUSD >= 0);

    if (valid.length === 0) {
      throw new Error(`No fee quotes available for ${token} ${fromChain}→${toChain}`);
    }

    const ranked = this.rank(valid);

    return {
      quotes: ranked,
      cheapest: ranked[0],
      fastest: [...ranked].sort((a, b) => a.estimatedTimeSeconds - b.estimatedTimeSeconds)[0],
      fromChain,
      toChain,
      token,
      amount,
      generatedAt: new Date(),
    };
  }

  normalize(quotes: ProviderFeeQuote[]): ProviderFeeQuote[] {
    const total = quotes.reduce((s, q) => s + q.totalFeeUSD, 0);
    const avg = total / quotes.length;
    return quotes.map((q) => ({
      ...q,
      totalFeeUSD: parseFloat(((q.totalFeeUSD / (avg || 1)) * q.totalFeeUSD).toFixed(4)),
    }));
  }

  cheapest(quotes: ProviderFeeQuote[]): ProviderFeeQuote | null {
    if (!quotes.length) return null;
    return quotes.reduce((best, q) => (q.totalFeeUSD < best.totalFeeUSD ? q : best));
  }

  private rank(quotes: ProviderFeeQuote[]): RankedFeeQuote[] {
    const sorted = [...quotes].sort((a, b) => a.totalFeeUSD - b.totalFeeUSD);
    const worst = sorted[sorted.length - 1].totalFeeUSD;

    return sorted.map((q, i) => ({
      ...q,
      rank: i + 1,
      savingsVsWorstUSD: parseFloat((worst - q.totalFeeUSD).toFixed(4)),
    }));
  }
}

export function buildStaticFeeSource(
  providerName: string,
  gasFeeUSD: number,
  feeRate: number,
  estimatedTimeSeconds: number,
): FeeSource {
  return async (fromChain, toChain, token, amount) => {
    const protocolFeeUSD = amount * feeRate;
    const totalFeeUSD = gasFeeUSD + protocolFeeUSD;
    return {
      provider: providerName,
      fromChain,
      toChain,
      token,
      amount,
      gasFeeUSD,
      protocolFeeUSD: parseFloat(protocolFeeUSD.toFixed(4)),
      totalFeeUSD: parseFloat(totalFeeUSD.toFixed(4)),
      outputAmount: parseFloat((amount - totalFeeUSD).toFixed(6)),
      estimatedTimeSeconds,
    };
  };
}
