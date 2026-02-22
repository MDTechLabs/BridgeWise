import { ApiRequest, ApiResponse } from './types';
import opossum from 'opossum';

// Removed unused constants to resolve lint warnings


// Mock API call function must be defined before getBreaker

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
      group: 'Bridge-Providers',
    };
    const breaker = new opossum(mockApiCall, options);
    //
    breaker.on('open', () =>
      console.log(`[${providerName}] Circuit breaker opened.`),
    );
    breaker.on('halfOpen', () =>
      console.log(`[${providerName}] Circuit breaker is half-open.`),
    );
    breaker.on('close', () =>
      console.log(`[${providerName}] Circuit breaker closed.`),
    );
    breaker.on('fallback', (result: any) =>
      console.log(`[${providerName}] Fallback executed with result:`, result),
    );

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
  } catch (err: unknown) {
    let code = 'UNKNOWN_ERROR';
    let message = 'Circuit breaker opened';
    if (isApiError(err)) {
      code = err.code ?? 'UNKNOWN_ERROR';
      message = err.message ?? 'An unknown error occurred.';
    } else if (err instanceof Error) {
      message = err.message;
    } else {
      message = String(err);
    }
    return {
      success: false,
      error: {
        code,
        message,
      },
    };
  }
}


function isApiError(err: unknown): err is { code?: string; message?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    ('code' in err || 'message' in err)
  );
}

/**
 * A mock API call function to simulate network requests.
 * This will be replaced with actual `fetch` calls.
 */
async function mockApiCall(request: ApiRequest): Promise<any> {
  await Promise.resolve(); // Added await to satisfy require-await
  console.log(`Calling API for provider: ${request.provider.name}`);

  if (request.provider.name === 'stellar') {
    // Consistently fail for Stellar to test circuit breaker
    const err = new Error('Transient failure') as Error & { code?: string };
    err.code = 'TRANSIENT_ERROR';
    throw err;
  }

  // LayerZero will have random failures
  if (Math.random() > 0.5) {
    return { message: 'Success!' };
  } else {
    const isTransient = Math.random() > 0.3;
    const err = new Error(
      isTransient ? 'Transient failure' : 'Permanent failure',
    ) as Error & { isTransient?: boolean };
    err.isTransient = isTransient;
    throw err;
  }
}
