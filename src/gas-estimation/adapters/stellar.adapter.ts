import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { StellarFeeResponse } from '../interfaces/fees.interface';

@Injectable()
export class StellarAdapter {
  private readonly logger = new Logger(StellarAdapter.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'STELLAR_API_URL',
      'https://horizon.stellar.org',
    );
    this.timeoutMs = this.configService.get<number>('ADAPTER_TIMEOUT', 5000);
    this.retryAttempts = this.configService.get<number>('ADAPTER_RETRY', 3);
  }

  async getFees(): Promise<StellarFeeResponse> {
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await firstValueFrom(
          this.httpService
            .get(`${this.baseUrl}/fee_stats`)
            .pipe(
              timeout(this.timeoutMs),
              catchError((error) => {
                this.logger.error(
                  `Stellar API error (attempt ${attempt}/${this.retryAttempts}):`,
                  error.message,
                );
                throw error;
              }),
            ),
        );

        return this.transformResponse(response.data);
      } catch (error) {
        if (attempt === this.retryAttempts) {
          throw new Error(
            `Stellar provider unavailable after ${this.retryAttempts} attempts: ${error.message}`,
          );
        }
        
        // Exponential backoff
        await this.delay(Math.pow(2, attempt) * 100);
      }
    }

    throw new Error('Stellar provider unavailable');
  }

  private transformResponse(data: any): StellarFeeResponse {
    // Stellar returns fees in stroops (1 XLM = 10,000,000 stroops)
    return {
      min: data.min_accepted_fee || '100',
      mode: data.mode_accepted_fee || '100',
      p10: data.p10_accepted_fee || '100',
      p20: data.p20_accepted_fee || '100',
      p30: data.p30_accepted_fee || '100',
      p40: data.p40_accepted_fee || '100',
      p50: data.p50_accepted_fee || '100',
      p60: data.p60_accepted_fee || '100',
      p70: data.p70_accepted_fee || '100',
      p80: data.p80_accepted_fee || '100',
      p90: data.p90_accepted_fee || '100',
      p95: data.p95_accepted_fee || '100',
      p99: data.p99_accepted_fee || '100',
      decimals: 7, // Stellar uses 7 decimal places (stroops)
      symbol: 'XLM',
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}