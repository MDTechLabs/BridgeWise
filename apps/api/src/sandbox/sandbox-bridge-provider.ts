import { Injectable, Logger } from '@nestjs/common';
import { BridgeAdapter } from '../quotes/quotes.service';
import { GetQuoteDto, QuoteOption } from '../quotes/dto/get-quote.dto';
import { SandboxService } from './sandbox.service';

/**
 * Sandbox Bridge Adapter
 * Plugs into QuotesService as a recognized provider adapter for sandbox scenarios
 */
@Injectable()
export class SandboxBridgeProvider implements BridgeAdapter {
  readonly name = 'BridgeWiseSandbox';
  private readonly logger = new Logger(SandboxBridgeProvider.name);

  constructor(private readonly sandboxService: SandboxService) {}

  async getQuote(params: GetQuoteDto): Promise<QuoteOption | null> {
    try {
      const quote = await this.sandboxService.getQuote({
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        amount: params.amount,
      });

      if (!quote.routeSupported) {
        return null;
      }

      return {
        id: quote.id,
        provider: this.name,
        fromChain: quote.fromChain,
        toChain: quote.toChain,
        fromToken: quote.fromToken,
        toToken: quote.toToken,
        inputAmount: quote.inputAmount,
        outputAmount: quote.outputAmount,
        feeAmount: quote.feeAmount,
        feeToken: quote.feeToken,
        estimatedTimeSeconds: quote.estimatedTimeSeconds,
        netOutputAmount: quote.netOutputAmount,
      };
    } catch (err: any) {
      this.logger.warn(`Sandbox bridge quote generation skipped: ${err.message}`);
      return null;
    }
  }
}
