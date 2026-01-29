import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { LayerZeroFeeResponse } from '../interfaces/fees.interface';

@Injectable()
export class LayerZeroAdapter {
  private readonly logger = new Logger(LayerZeroAdapter.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly defaultSourceChain: string;
  private readonly defaultDestinationChain: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'LAYERZERO_API_URL',
      'https://api.layerzero.network',
    );
    this.timeoutMs = this.configService.get<number>('ADAPTER_TIMEOUT', 5000);
    this.retryAttempts = this.configService.get<number>('ADAPTER_RETRY', 3);
    this.defaultSourceChain = this.configService.get<string>(
      'LAYERZERO_SOURCE_CHAIN',
      'ethereum',
    );
    this.defaultDestinationChain = this.configService.get<string>(
      'LAYERZERO_DESTINATION_CHAIN',
      'arbitrum',
    );
  }

  async getFees(
    sourceChain?: string,
    destinationChain?: string,
  ): Promise<LayerZeroFeeResponse> {
    const source = sourceChain || this.defaultSourceChain;
    const destination = destinationChain || this.defaultDestinationChain;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        // LayerZero typically requires estimating fees for a specific route
        const response = await firstValueFrom(
          this.httpService
            .get(`${this.baseUrl}/v1/estimate`, {
              params: {
                source,
                destination,
              },
            })
            .pipe(
              timeout(this.timeoutMs),
              catchError((error) => {
                this.logger.error(
                  `LayerZero API error (attempt ${attempt}/${this.retryAttempts}):`,
                  error.message,
                );
                throw error;
              }),
            ),
        );

        return this.transformResponse(response.data, source, destination);
      } catch (error) {
        if (attempt === this.retryAttempts) {
          // Fallback to default values if API is unavailable
          this.logger.warn('Using LayerZero fallback values');
          return this.getFallbackFees(source, destination);
        }
        
        await this.delay(Math.pow(2, attempt) * 100);
      }
    }

    return this.getFallbackFees(source, destination);
  }

  private transformResponse(
    data: any,
    sourceChain: string,
    destinationChain: string,
  ): LayerZeroFeeResponse {
    // LayerZero fees are typically in wei (18 decimals for ETH)
    return {
      baseFee: data.nativeFee || data.baseFee || '100000000000000',
      standardFee: data.nativeFee || data.standardFee || '150000000000000',
      priorityFee: data.priorityFee || '200000000000000',
      decimals: 18, // Most LayerZero fees are in native gas tokens (ETH-like)
      symbol: this.getSymbolForChain(sourceChain),
      sourceChain,
      destinationChain,
    };
  }

  private getFallbackFees(
    sourceChain: string,
    destinationChain: string,
  ): LayerZeroFeeResponse {
    return {
      baseFee: '100000000000000', // 0.0001 ETH
      standardFee: '150000000000000', // 0.00015 ETH
      priorityFee: '200000000000000', // 0.0002 ETH
      decimals: 18,
      symbol: this.getSymbolForChain(sourceChain),
      sourceChain,
      destinationChain,
    };
  }

  private getSymbolForChain(chain: string): string {
    const symbols: Record<string, string> = {
      ethereum: 'ETH',
      arbitrum: 'ETH',
      optimism: 'ETH',
      polygon: 'MATIC',
      avalanche: 'AVAX',
      bsc: 'BNB',
    };
    return symbols[chain.toLowerCase()] || 'ETH';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}