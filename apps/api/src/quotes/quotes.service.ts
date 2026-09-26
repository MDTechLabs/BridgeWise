import { Injectable, Logger } from '@nestjs/common';
import { GetQuoteDto, QuoteOption } from './dto/get-quote.dto';

export interface BridgeAdapter {
  name: string;
  getQuote(params: GetQuoteDto): Promise<QuoteOption | null>;
}

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);
  private adapters: BridgeAdapter[] = [];

  constructor() {
    this.registerDefaultAdapters();
  }

  private registerDefaultAdapters() {
    // Register default bridge adapter implementations
    this.adapters.push({
      name: 'StellarBridgeAdapter',
      getQuote: async (dto: GetQuoteDto): Promise<QuoteOption | null> => {
        const inputAmount = parseFloat(dto.amount);
        if (isNaN(inputAmount) || inputAmount <= 0) return null;
        const fee = 0.50;
        const output = Math.max(0, inputAmount * 0.995 - fee);
        return {
          id: `quote-stellar-${Date.now()}`,
          provider: 'StellarBridge',
          fromChain: dto.fromChain,
          toChain: dto.toChain,
          fromToken: dto.fromToken,
          toToken: dto.toToken || dto.fromToken,
          inputAmount: dto.amount,
          outputAmount: (inputAmount * 0.995).toFixed(6),
          feeAmount: fee.toString(),
          feeToken: 'USDC',
          estimatedTimeSeconds: 15,
          netOutputAmount: output.toFixed(6),
        };
      },
    });

    this.adapters.push({
      name: 'SorobanBridgeAdapter',
      getQuote: async (dto: GetQuoteDto): Promise<QuoteOption | null> => {
        const inputAmount = parseFloat(dto.amount);
        if (isNaN(inputAmount) || inputAmount <= 0) return null;
        const fee = 0.20;
        const output = Math.max(0, inputAmount * 0.998 - fee);
        return {
          id: `quote-soroban-${Date.now()}`,
          provider: 'SorobanBridge',
          fromChain: dto.fromChain,
          toChain: dto.toChain,
          fromToken: dto.fromToken,
          toToken: dto.toToken || dto.fromToken,
          inputAmount: dto.amount,
          outputAmount: (inputAmount * 0.998).toFixed(6),
          feeAmount: fee.toString(),
          feeToken: 'XLM',
          estimatedTimeSeconds: 5,
          netOutputAmount: output.toFixed(6),
        };
      },
    });

    this.adapters.push({
      name: 'EVMBridgeAdapter',
      getQuote: async (dto: GetQuoteDto): Promise<QuoteOption | null> => {
        const inputAmount = parseFloat(dto.amount);
        if (isNaN(inputAmount) || inputAmount <= 0) return null;
        const fee = 1.20;
        const output = Math.max(0, inputAmount * 0.992 - fee);
        return {
          id: `quote-evm-${Date.now()}`,
          provider: 'EVMBridge',
          fromChain: dto.fromChain,
          toChain: dto.toChain,
          fromToken: dto.fromToken,
          toToken: dto.toToken || dto.fromToken,
          inputAmount: dto.amount,
          outputAmount: (inputAmount * 0.992).toFixed(6),
          feeAmount: fee.toString(),
          feeToken: 'ETH',
          estimatedTimeSeconds: 120,
          netOutputAmount: output.toFixed(6),
        };
      },
    });
  }

  registerAdapter(adapter: BridgeAdapter) {
    this.adapters.push(adapter);
  }

  async getAggregatedQuotes(dto: GetQuoteDto): Promise<QuoteOption[]> {
    const quotePromises = this.adapters.map(adapter =>
      adapter.getQuote(dto).catch(err => {
        this.logger.error(`Adapter ${adapter.name} failed: ${err.message}`);
        return null;
      }),
    );

    const results = await Promise.allSettled(quotePromises);

    const validQuotes: QuoteOption[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) {
        validQuotes.push(result.value);
      }
    }

    // Sort quotes descending by net execution output amount
    return validQuotes.sort((a, b) => parseFloat(b.netOutputAmount) - parseFloat(a.netOutputAmount));
  }
}
