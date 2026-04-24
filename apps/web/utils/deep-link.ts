/**
 * Deep Linking utilities for BridgeWise.
 * Parses URL query params to prefill bridge UI state.
 */

export interface BridgeDeepLinkParams {
  fromChain?: string;
  toChain?: string;
  fromToken?: string;
  toToken?: string;
  amount?: string;
  recipient?: string;
}

const PARAM_KEYS: (keyof BridgeDeepLinkParams)[] = [
  'fromChain',
  'toChain',
  'fromToken',
  'toToken',
  'amount',
  'recipient',
];

/**
 * Parse bridge params from a URLSearchParams or query string.
 */
export function parseBridgeDeepLink(
  search: string | URLSearchParams,
): BridgeDeepLinkParams {
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search;

  const result: BridgeDeepLinkParams = {};
  for (const key of PARAM_KEYS) {
    const value = params.get(key);
    if (value !== null && value.trim() !== '') {
      result[key] = value.trim();
    }
  }
  return result;
}

/**
 * Serialize bridge params into a query string (without leading '?').
 */
export function serializeBridgeDeepLink(params: BridgeDeepLinkParams): string {
  const search = new URLSearchParams();
  for (const key of PARAM_KEYS) {
    const value = params[key];
    if (value !== undefined && value !== '') {
      search.set(key, value);
    }
  }
  return search.toString();
}
