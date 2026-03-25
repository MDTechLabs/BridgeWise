import { ApiRequest, ApiResponse } from './types';
/**
 * Executes an API call to a bridge provider with retry and circuit breaker logic.
 *
 * @param request The API request to execute.
 * @returns A promise that resolves with the API response.
 */
export declare function callApi(request: ApiRequest): Promise<ApiResponse>;
