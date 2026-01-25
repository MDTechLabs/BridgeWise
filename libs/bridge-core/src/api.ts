import { ApiRequest, ApiResponse } from './types';
import opossum from 'opossum';

const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const CIRCUIT_BREAKER_OPEN_DURATION_MS = 60000; // 1 minute
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;


// In-memory store for circuit breakers.
const breakers = new Map<string, opossum>();

function getBreaker(providerName: string): opossum {
  if (!breakers.has(providerName)) {
    const options = {
      timeout: 10000, // If our function takes longer than 10 seconds, trigger a failure
      errorThresholdPercentage: 50, // When 50% of requests fail, open the circuit
      resetTimeout: 30000, // After 30 seconds, try again.
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      name: providerName,
      group: 'Bridge-Providers'
    };
    const breaker = new opossum(mockApiCall, options);
    //
    breaker.on('open', () => console.log(`[${providerName}] Circuit breaker opened.`));
    breaker.on('halfOpen', () => console.log(`[${providerName}] Circuit breaker is half-open.`));
    breaker.on('close', () => console.log(`[${providerName}] Circuit breaker closed.`));
    breaker.on('fallback', (result: any) => console.log(`[${providerName}] Fallback executed with result:`, result));

    breakers.set(providerName, breaker);
  }
  return breakers.get(providerName)!;
}

/**
 * Executes an API call to a bridge provider with retry and circuit breaker logic.
 *
 * @param request The API request to execute.
 * @returns A promise that resolves with the API response.
 */
export async function callApi(request: ApiRequest): Promise<ApiResponse> {
  const breaker = getBreaker(request.provider.name);
  try {
    const data = await breaker.fire(request);
    return { success: true, data };
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: err.code || 'UNKNOWN_ERROR',
        message: err.message || 'Circuit breaker opened',
      },
    };
  }
}

/**
 * A mock API call function to simulate network requests.
 * This will be replaced with actual `fetch` calls.
 */
async function mockApiCall(request: ApiRequest): Promise<any> {
    console.log(`Calling API for provider: ${request.provider.name}`);
    
    if (request.provider.name === 'stellar') {
        // Consistently fail for Stellar to test circuit breaker
        const err: any = new Error('Transient failure');
        err.code = 'TRANSIENT_ERROR';
        throw err;
    }

    // LayerZero will have random failures
    if (Math.random() > 0.5) {
        return { message: "Success!" };
    } else {
        const isTransient = Math.random() > 0.3;
        const err: any = new Error(isTransient ? "Transient failure" : "Permanent failure");
        err.isTransient = isTransient;
        throw err;
    }
}

