import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '../../config/config.service';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { HopFeeResponse } from '../interfaces/fees.interface';
import { HopService } from '../hop.service';
import CircuitBreaker from 'opossum';

/**
 * STEP 9: Enhanced Hop Adapter with Circuit Breaker
 * ==================================================
 *
 * This adapter is responsible for communicating with the Hop Protocol API.
 * We've enhanced it with several important features:
 * go forward
 * 1. Circuit Breaker Pattern
 *    - Imagine a circuit breaker in your house
 *    - When there's a power surge, it "trips" to protect your appliances
 *    - Same concept here: if Hop API fails repeatedly, we "trip" the circuit
 *    - This prevents wasting time on requests that will likely fail
 *
 * 2. Retry Logic with Exponential Backoff
 *    - If a request fails, we try again
 *    - But we wait longer between each retry (exponential backoff)
 *    - Try 1: Wait 100ms
 *    - Try 2: Wait 200ms
 *    - Try 3: Wait 400ms
 *    - This prevents overwhelming a struggling API
 *
 * 3. Fallback Behavior
 *    - If all retries fail, use cached data
 *    - If no cache, use static fallback fees
 *    - User always gets a response, even if API is down
 */

@Injectable()
export class HopAdapter {
  private readonly logger = new Logger(HopAdapter.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly defaultToken: string;
  private readonly defaultSourceChain: string;
  private readonly defaultDestinationChain: string;

  /**
   * Circuit Breaker Configuration
   * ==============================
   *
   * The circuit breaker monitors API health and prevents cascading failures.
   *
   * Key settings:
   * - timeout: 5000ms (5 seconds) - How long to wait for a response
   * - errorThresholdPercentage: 50 - If 50% of requests fail, trip the circuit
   * - resetTimeout: 30000ms (30 seconds) - How long to wait before trying again
   * - volumeThreshold: 5 - Need at least 5 requests before calculating failure rate
   */
  private circuitBreaker: CircuitBreaker;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly hopService: HopService,
  ) {
    // Load configuration from environment variables
    this.baseUrl = this.configService.get('api')?.baseUrl || 'https://api.hop.exchange';
    this.timeoutMs = this.configService.get('api')?.timeout || 5000;
    this.retryAttempts = 3; // Try up to 3 times
    this.defaultToken = 'USDC';
    this.defaultSourceChain = 'ethereum';
    this.defaultDestinationChain = 'arbitrum';

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(
      this.makeApiCall.bind(this),
      {
        timeout: this.timeoutMs,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        volumeThreshold: 5,
        name: 'HopApiCircuitBreaker',
      },
    );

    // Set up circuit breaker event listeners for monitoring
    this.setupCircuitBreakerEvents();
  }

  /**
   * STEP 10: Main Entry Point - Get Fees
   * =====================================
   *
   * This is the main function that other parts of the app call.
   * It orchestrates the entire fee fetching process.
   *
   * Flow:
   * 1. Try to get fees from Hop API (with retries)
   * 2. If that fails, try to get from cache
   * 3. If cache is empty, use fallback fees
   * 4. Always return something (never throw an error to the caller)
   *
   * @param token - Token symbol (e.g., 'USDC', 'ETH')
   * @param sourceChain - Source blockchain
   * @param destinationChain - Destination blockchain
   * @param amount - Amount to bridge (in smallest unit)
   * @returns Fee information
   */
  async getFees(
    token?: string,
    sourceChain?: string,
    destinationChain?: string,
    amount?: string,
  ): Promise<HopFeeResponse> {
    const selectedToken = token || this.defaultToken;
    const source = sourceChain || this.defaultSourceChain;
    const destination = destinationChain || this.defaultDestinationChain;
    const bridgeAmount = amount || '1000000'; // Default 1 USDC (6 decimals)

    // Create a request object for caching
    const request = {
      sourceChain: source as any,
      targetChain: destination as any,
      assetAmount: bridgeAmount,
      tokenAddress: selectedToken,
    };

    /**
     * STEP 10.1: Try API with Retries
     * ================================
     *
     * We'll try multiple times before giving up.
     * Each attempt has exponential backoff.
     */
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        this.logger.debug(`Fetching Hop fees (attempt ${attempt}/${this.retryAttempts})`, {
          token: selectedToken,
          source,
          destination,
          amount: bridgeAmount,
        });

        // Use circuit breaker to make the API call
        const response = await this.circuitBreaker.fire({
          token: selectedToken,
          source,
          destination,
          amount: bridgeAmount,
        });

        // Normalize the response using our HopService
        const normalized = this.hopService.normalizeFees(response.data);
        
        // Cache the successful response for future use
        this.hopService.setCachedQuote(request, normalized);

        this.logger.debug('Successfully fetched Hop fees', { normalized });
        return normalized;

      } catch (error) {
        this.logger.error(
          `Hop API error (attempt ${attempt}/${this.retryAttempts}):`,
          error.message,
        );

        // If this was the last attempt, move to fallback
        if (attempt === this.retryAttempts) {
          break;
        }

        // Wait before retrying (exponential backoff)
        // Attempt 1: 100ms, Attempt 2: 200ms, Attempt 3: 400ms
        await this.delay(Math.pow(2, attempt) * 100);
      }
    }

    /**
     * STEP 10.2: Try Cache Fallback
     * ==============================
     *
     * API failed, let's check if we have cached data.
     */
    this.logger.warn('Hop API failed, trying cache');
    const cachedQuote = this.hopService.getCachedQuote(request);
    
    if (cachedQuote) {
      this.logger.info('Using cached Hop quote');
      return cachedQuote;
    }

    /**
     * STEP 10.3: Use Static Fallback
     * ===============================
     *
     * No cache available, use conservative estimates.
     */
    this.logger.warn('No cache available, using fallback fees');
    return this.hopService.getFallbackFees(selectedToken, source, destination);
  }

  /**
   * STEP 11: Make API Call
   * =======================
   *
   * This is the actual HTTP request to Hop API.
   * It's wrapped by the circuit breaker.
   *
   * The circuit breaker will:
   * - Call this function
   * - Monitor for failures
   * - Trip the circuit if too many failures occur
   *
   * @param params - Request parameters
   * @returns API response
   */
  private async makeApiCall(params: {
    token: string;
    source: string;
    destination: string;
    amount: string;
  }): Promise<any> {
    return firstValueFrom(
      this.httpService
        .get(`${this.baseUrl}/v1/quote`, {
          params: {
            amount: params.amount,
            token: params.token,
            fromChain: params.source,
            toChain: params.destination,
          },
        })
        .pipe(
          timeout(this.timeoutMs),
          catchError((error) => {
            // Log the error and re-throw it
            this.logger.error('Hop API request failed:', error.message);
            throw error;
          }),
        ),
    );
  }

  /**
   * STEP 12: Circuit Breaker Event Monitoring
   * ==========================================
   *
   * The circuit breaker emits events when its state changes.
   * We listen to these events to log what's happening.
   *
   * States:
   * - CLOSED: Normal operation, requests go through
   * - OPEN: Too many failures, blocking all requests
   * - HALF_OPEN: Testing if the service has recovered
   */
  private setupCircuitBreakerEvents(): void {
    // Circuit opened (too many failures)
    this.circuitBreaker.on('open', () => {
      this.logger.error('Hop API circuit breaker OPENED - too many failures');
    });

    // Circuit closed (service recovered)
    this.circuitBreaker.on('close', () => {
      this.logger.info('Hop API circuit breaker CLOSED - service recovered');
    });

    // Circuit half-open (testing recovery)
    this.circuitBreaker.on('halfOpen', () => {
      this.logger.warn('Hop API circuit breaker HALF-OPEN - testing recovery');
    });

    // Request succeeded
    this.circuitBreaker.on('success', () => {
      this.logger.debug('Hop API request succeeded');
    });

    // Request failed
    this.circuitBreaker.on('failure', (error) => {
      this.logger.warn('Hop API request failed:', error.message);
    });

    // Circuit breaker rejected request (circuit is open)
    this.circuitBreaker.on('reject', () => {
      this.logger.warn('Hop API request rejected - circuit breaker is OPEN');
    });

    // Request timed out
    this.circuitBreaker.on('timeout', () => {
      this.logger.error('Hop API request timed out');
    });
  }

  /**
   * STEP 13: Helper - Delay Function
   * =================================
   * 
   * Simple utility to wait for a specified time.
   * Used for exponential backoff between retries.
   * 
   * @param ms - Milliseconds to wait
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * STEP 14: Get Circuit Breaker Stats
   * ===================================
   * 
   * Expose circuit breaker statistics for monitoring.
   * Useful for debugging and observability.
   * 
   * @returns Circuit breaker statistics
   */
  getCircuitBreakerStats() {
    return {
      state: this.circuitBreaker.isOpen() ? 'OPEN' : 'CLOSED',
      name: this.circuitBreaker.name,
      enabled: this.circuitBreaker.enabled,
    };
  }
}