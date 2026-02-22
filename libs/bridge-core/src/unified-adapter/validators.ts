/**
 * Validation utilities for adapter configuration and data
 */

import { BridgeAdapterConfig } from './adapter.interface';
import { TokenMapping } from './token-registry.interface';
import { ChainId } from '../types';
import { ADAPTER_ERRORS } from './errors';

/**
 * Validate bridge adapter configuration
 *
 * @param config Configuration to validate
 * @throws AdapterError if configuration is invalid
 */
export function validateAdapterConfig(config: BridgeAdapterConfig): void {
  // Check required fields
  if (!config.provider) {
    throw ADAPTER_ERRORS.invalidConfig('Missing provider identifier');
  }

  if (!config.name || config.name.trim().length === 0) {
    throw ADAPTER_ERRORS.invalidConfig('Missing or empty provider name');
  }

  if (!config.endpoints) {
    throw ADAPTER_ERRORS.invalidConfig('Missing endpoints configuration');
  }

  if (!config.endpoints.primary && !config.endpoints.fallback) {
    throw ADAPTER_ERRORS.invalidConfig(
      'Must specify at least one endpoint (primary or fallback)',
    );
  }

  // Validate endpoint URLs
  if (config.endpoints.primary) {
    validateUrl(config.endpoints.primary, 'Primary endpoint');
  }
  if (config.endpoints.fallback) {
    validateUrl(config.endpoints.fallback, 'Fallback endpoint');
  }
  if (config.endpoints.rpc) {
    validateUrl(config.endpoints.rpc, 'RPC endpoint');
  }

  // Validate timeout
  if (config.timeout !== undefined && config.timeout < 100) {
    throw ADAPTER_ERRORS.invalidConfig('Timeout must be at least 100ms');
  }

  // Validate retry configuration
  if (config.retry) {
    if (config.retry.attempts < 0) {
      throw ADAPTER_ERRORS.invalidConfig('Retry attempts must be non-negative');
    }
    if (config.retry.initialDelayMs < 0) {
      throw ADAPTER_ERRORS.invalidConfig(
        'Retry initial delay must be non-negative',
      );
    }
    if (
      config.retry.backoffMultiplier !== undefined &&
      config.retry.backoffMultiplier <= 0
    ) {
      throw ADAPTER_ERRORS.invalidConfig('Backoff multiplier must be positive');
    }
  }

  // Validate rate limit configuration
  if (config.rateLimit) {
    if (config.rateLimit.requestsPerSecond <= 0) {
      throw ADAPTER_ERRORS.invalidConfig(
        'Requests per second must be positive',
      );
    }
    if (config.rateLimit.windowMs <= 0) {
      throw ADAPTER_ERRORS.invalidConfig('Window must be positive');
    }
  }
}

/**
 * Validate a token mapping
 *
 * @param mapping Mapping to validate
 * @throws AdapterError if mapping is invalid
 */
export function validateTokenMapping(mapping: TokenMapping): void {
  // Validate source token
  if (!mapping.sourceToken) {
    throw ADAPTER_ERRORS.invalidConfig('Missing source token');
  }
  validateTokenMetadata(mapping.sourceToken, 'Source token');

  // Validate destination token
  if (!mapping.destinationToken) {
    throw ADAPTER_ERRORS.invalidConfig('Missing destination token');
  }
  validateTokenMetadata(mapping.destinationToken, 'Destination token');

  // Validate conversion rate
  if (!mapping.conversionRate) {
    throw ADAPTER_ERRORS.invalidConfig('Missing conversion rate');
  }
  try {
    const rate = BigInt(mapping.conversionRate);
    if (rate <= 0n) {
      throw new Error('Conversion rate must be positive');
    }
  } catch (error) {
    throw ADAPTER_ERRORS.invalidConfig(
      `Invalid conversion rate: ${String(error)}`,
    );
  }

  // Validate amounts
  if (mapping.minAmount) {
    try {
      const min = BigInt(mapping.minAmount);
      if (min < 0n) {
        throw new Error('Minimum amount must be non-negative');
      }
    } catch (error) {
      throw ADAPTER_ERRORS.invalidConfig(
        `Invalid min amount: ${String(error)}`,
      );
    }
  }

  if (mapping.maxAmount) {
    try {
      const max = BigInt(mapping.maxAmount);
      if (max < 0n) {
        throw new Error('Maximum amount must be non-negative');
      }
    } catch (error) {
      throw ADAPTER_ERRORS.invalidConfig(
        `Invalid max amount: ${String(error)}`,
      );
    }
  }

  // Validate min <= max if both present
  if (mapping.minAmount && mapping.maxAmount) {
    const min = BigInt(mapping.minAmount);
    const max = BigInt(mapping.maxAmount);
    if (min > max) {
      throw ADAPTER_ERRORS.invalidConfig(
        'Minimum amount cannot exceed maximum amount',
      );
    }
  }
}

/**
 * Validate token metadata
 *
 * @param token Token metadata to validate
 * @param context Context for error messages
 * @throws AdapterError if metadata is invalid
 */
export function validateTokenMetadata(
  token: any,
  context: string = 'Token',
): void {
  if (!token) {
    throw ADAPTER_ERRORS.invalidConfig(`Missing ${context}`);
  }

  if (!token.symbol || token.symbol.trim().length === 0) {
    throw ADAPTER_ERRORS.invalidConfig(`${context}: Missing or empty symbol`);
  }

  if (!token.name || token.name.trim().length === 0) {
    throw ADAPTER_ERRORS.invalidConfig(`${context}: Missing or empty name`);
  }

  if (
    token.decimals === undefined ||
    token.decimals < 0 ||
    token.decimals > 77
  ) {
    throw ADAPTER_ERRORS.invalidConfig(
      `${context}: Invalid decimals (must be 0-77)`,
    );
  }

  if (!token.address || token.address.trim().length === 0) {
    throw ADAPTER_ERRORS.invalidConfig(`${context}: Missing or empty address`);
  }

  if (!token.chain || !isValidChainId(token.chain)) {
    throw ADAPTER_ERRORS.invalidConfig(`${context}: Invalid chain identifier`);
  }
}

/**
 * Validate chain identifier
 *
 * @param chain Chain to validate
 * @returns True if chain is valid
 */
export function isValidChainId(chain: any): chain is ChainId {
  const validChains: ChainId[] = [
    'ethereum',
    'stellar',
    'polygon',
    'arbitrum',
    'optimism',
    'base',
    'gnosis',
    'nova',
    'bsc',
    'avalanche',
  ];
  return validChains.includes(chain);
}

/**
 * Validate URL format
 *
 * @param url URL to validate
 * @param context Context for error messages
 * @throws AdapterError if URL is invalid
 */
function validateUrl(url: string, context: string): void {
  try {
    new URL(url);
  } catch (error) {
    throw ADAPTER_ERRORS.invalidConfig(`${context}: Invalid URL format`);
  }
}

/**
 * Validate amount format (must be valid big integer string)
 *
 * @param amount Amount to validate
 * @param context Context for error messages
 * @throws AdapterError if amount is invalid
 */
export function validateAmount(
  amount: string,
  context: string = 'Amount',
): void {
  if (!amount) {
    throw ADAPTER_ERRORS.invalidAmount(`${context} is required`);
  }

  try {
    const bn = BigInt(amount);
    if (bn < 0n) {
      throw ADAPTER_ERRORS.invalidAmount(`${context} must be non-negative`);
    }
  } catch (error) {
    throw ADAPTER_ERRORS.invalidAmount(
      `${context} must be a valid number: ${String(error)}`,
    );
  }
}

/**
 * Validate fee percentage
 *
 * @param fee Fee percentage to validate (0-100)
 * @param context Context for error messages
 * @throws AdapterError if fee is invalid
 */
export function validateFeePercentage(
  fee: number,
  context: string = 'Fee',
): void {
  if (fee < 0 || fee > 100) {
    throw ADAPTER_ERRORS.invalidConfig(`${context} must be between 0 and 100`);
  }
}
