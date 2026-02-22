"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callApi = callApi;
const opossum_1 = __importDefault(require("opossum"));
// Removed unused constants to resolve lint warnings
// In-memory store for circuit breakers.
const breakers = new Map();
function getBreaker(providerName) {
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
        const breaker = new opossum_1.default(mockApiCall, options);
        //
        breaker.on('open', () => console.log(`[${providerName}] Circuit breaker opened.`));
        breaker.on('halfOpen', () => console.log(`[${providerName}] Circuit breaker is half-open.`));
        breaker.on('close', () => console.log(`[${providerName}] Circuit breaker closed.`));
        breaker.on('fallback', (result) => console.log(`[${providerName}] Fallback executed with result:`, result));
        breakers.set(providerName, breaker);
    }
    return breakers.get(providerName);
}
/**
 * Executes an API call to a bridge provider with retry and circuit breaker logic.
 *
 * @param request The API request to execute.
 * @returns A promise that resolves with the API response.
 */
async function callApi(request) {
    const breaker = getBreaker(request.provider.name);
    try {
        const data = await breaker.fire(request);
        return { success: true, data };
    }
    catch (err) {
        let code = 'UNKNOWN_ERROR';
        let message = 'Circuit breaker opened';
        const safeErr = err && typeof err === 'object' && 'code' in err
            ? err
            : { code: 'UNKNOWN_ERROR', message: String(err) };
        if (typeof safeErr === 'object' && safeErr) {
            if ('code' in safeErr &&
                typeof safeErr.code === 'string') {
                code = safeErr.code;
            }
            if ('message' in err &&
                typeof err.message === 'string') {
                message = err.message;
            }
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
/**
 * A mock API call function to simulate network requests.
 * This will be replaced with actual `fetch` calls.
 */
async function mockApiCall(request) {
    await Promise.resolve(); // Added await to satisfy require-await
    console.log(`Calling API for provider: ${request.provider.name}`);
    if (request.provider.name === 'stellar') {
        // Consistently fail for Stellar to test circuit breaker
        const err = new Error('Transient failure');
        err.code = 'TRANSIENT_ERROR';
        throw err;
    }
    // LayerZero will have random failures
    if (Math.random() > 0.5) {
        return { message: 'Success!' };
    }
    else {
        const isTransient = Math.random() > 0.3;
        const err = new Error(isTransient ? 'Transient failure' : 'Permanent failure');
        err.isTransient = isTransient;
        throw err;
    }
}
