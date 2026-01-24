import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { HopFeeResponse } from '../interfaces/fee.interface';

@Injectable()
export class HopAdapter {
  private readonly logger = new Logger(HopAdapter.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly defaultToken: string;
  private readonly defaultSourceChain: string;
  private readonly defaultDestinationChain: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'HOP_API_URL',
      'https://api.hop.exchange',
    );
    this.timeoutMs = this.configService.get<number>('ADAPTER_TIMEOUT', 5000);
    this.retryAttempts = this.configService.get<number>('ADAPTER_RETRY', 3);
    this.defaultToken = this.configService.get<string>('HOP_DEFAULT_TOKEN', 'USDC');
    this.defaultSourceChain = this.configService.get<string>(
      'HOP_SOURCE_CHAIN',
      'ethereum',
    );
    this.defaultDestinationChain = this.configService.get<string>(
      'HOP_DESTINATION_CHAIN',
      'arbitrum',
    );
  }

  async getFees(
    token?: string,
    sourceChain?: string,
    destinationChain?: string,
    amount?: string,
  ): Promise<HopFeeResponse> {
    const selectedToken = token || this.defaultToken;
    const source = sourceChain || this.defaultSourceChain;
    const destination = destinationChain || this.defaultDestinationChain;
    const bridgeAmount = amount || '1000000'; // Default 1 USDC

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        // Hop API requires amount, token, and chains for fee estimation
        const response = await firstValueFrom(
          this.httpService
            .get(`${this.baseUrl}/v1/quote`, {
              params: {
                amount: bridgeAmount,
                token: selectedToken,
                fromChain: source,
                toChain: destination,
              },
            })
            .pipe(
              timeout(this.timeoutMs),
              catchError((error) => {
                this.logger.error(
                  `Hop API error (attempt ${attempt}/${this.retryAttempts}):`,
                  error.message,
                );
                throw error;
              }),
            ),
        );

        return this.transformResponse(
          response.data,
          selectedToken,
          source,
          destination,
        );
      } catch (error) {
        if (attempt === this.retryAttempts) {
          this.logger.warn('Using Hop fallback values');
          return this.getFallbackFees(selectedToken, source, destination);
        }
        
        await this.delay(Math.pow(2, attempt) * 100);
      }
    }

    return this.getFallbackFees(selectedToken, source, destination);
  }

  private transformResponse(
    data: any,
    token: string,
    sourceChain: string,
    destinationChain: string,
  ): HopFeeResponse {
    const decimals = this.getDecimalsForToken(token);
    
    return {
      lpFee: data.lpFee || data.totalFee || '1000',
      bonderFee: data.bonderFee || '500',
      destinationTxFee: data.destinationTxFee || data.relayerFee || '2000',
      decimals,
      symbol: token,
      token,
      sourceChain,
      destinationChain,
    };
  }

  private getFallbackFees(
    token: string,
    sourceChain: string,
    destinationChain: string,
  ): HopFeeResponse {
    const decimals = this.getDecimalsForToken(token);
    
    // Fallback fees as percentage of 1 token
    const baseAmount = Math.pow(10, decimals);
    
    return {
      lpFee: Math.floor(baseAmount * 0.0004).toString(), // 0.04%
      bonderFee: Math.floor(baseAmount * 0.0002).toString(), // 0.02%
      destinationTxFee: Math.floor(baseAmount * 0.001).toString(), // 0.1%
      decimals,
      symbol: token,
      token,
      sourceChain,
      destinationChain,
    };
  }

  private getDecimalsForToken(token: string): number {
    const decimals: Record<string, number> = {
      USDC: 6,
      USDT: 6,
      DAI: 18,
      ETH: 18,
      MATIC: 18,
      WETH: 18,
    };
    return decimals[token.toUpperCase()] || 18;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}