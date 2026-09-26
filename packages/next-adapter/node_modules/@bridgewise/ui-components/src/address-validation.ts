import { isAddress } from 'ethers';
import { StrKey } from '@stellar/freighter-api';

/**
 * Supported chain types for address validation
 */
export type ChainType = 'EVM' | 'Stellar' | 'Base' | 'Arbitrum' | 'Optimism';

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  chainType: ChainType;
  normalizedAddress?: string;
}

/**
 * Validate EVM (Ethereum Virtual Machine) addresses
 * Supports: Ethereum, Polygon, BSC, Arbitrum, Optimism, Base, etc.
 */
export function validateEVMAddress(address: string, chainName?: string): ValidationResult {
  try {
    // Check if it's a valid EVM address format
    if (!isAddress(address)) {
      return {
        isValid: false,
        error: `Invalid EVM address format. Address must be a 42-character hexadecimal string starting with 0x`,
        chainType: 'EVM',
      };
    }

    // Normalize address (checksum)
    const normalizedAddress = isAddress(address) ? address.toLowerCase() : address;

    return {
      isValid: true,
      chainType: 'EVM',
      normalizedAddress,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `EVM address validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      chainType: 'EVM',
    };
  }
}

/**
 * Validate Stellar addresses
 * Stellar addresses start with 'G' and are 56 characters long
 */
export function validateStellarAddress(address: string): ValidationResult {
  try {
    // Basic format check
    if (!address || typeof address !== 'string') {
      return {
        isValid: false,
        error: 'Stellar address must be a non-empty string',
        chainType: 'Stellar',
      };
    }

    // Check length (should be 56 characters)
    if (address.length !== 56) {
      return {
        isValid: false,
        error: `Stellar address must be 56 characters long. Received ${address.length} characters`,
        chainType: 'Stellar',
      };
    }

    // Check prefix (should start with 'G' for public keys)
    if (!address.startsWith('G')) {
      return {
        isValid: false,
        error: "Stellar address must start with 'G' for public keys",
        chainType: 'Stellar',
      };
    }

    // Use StrKey to validate the address
    if (!StrKey.isValidEd25519PublicKey(address)) {
      return {
        isValid: false,
        error: 'Invalid Stellar address format',
        chainType: 'Stellar',
      };
    }

    return {
      isValid: true,
      chainType: 'Stellar',
      normalizedAddress: address,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Stellar address validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      chainType: 'Stellar',
    };
  }
}

/**
 * Universal address validator for all supported chains
 */
export function validateAddress(
  address: string,
  chain: string
): ValidationResult {
  const chainLower = chain.toLowerCase();

  // Map chain names to chain types
  const evmChains = [
    'ethereum',
    'polygon',
    'bsc',
    'arbitrum',
    'optimism',
    'base',
    'avalanche',
    'fantom',
    'cronos',
    'gnosis',
  ];

  const stellarChains = ['stellar'];

  // Determine chain type
  if (evmChains.some(c => chainLower.includes(c))) {
    return validateEVMAddress(address, chain);
  }

  if (stellarChains.some(c => chainLower.includes(c))) {
    return validateStellarAddress(address);
  }

  // Unknown chain type
  return {
    isValid: false,
    error: `Unsupported chain type: ${chain}. Supported chains: ${[...evmChains, ...stellarChains].join(', ')}`,
    chainType: 'EVM', // Default assumption
  };
}

/**
 * Validate destination address with enhanced error messages
 * This is the main export for UI integration
 */
export function validateDestinationAddress(
  address: string,
  destinationChain: string
): {
  isValid: boolean;
  errorMessage?: string;
  warnings?: string[];
} {
  // Check for empty/null
  if (!address || address.trim() === '') {
    return {
      isValid: false,
      errorMessage: 'Destination address is required',
    };
  }

  // Trim whitespace
  const trimmedAddress = address.trim();

  // Perform validation
  const result = validateAddress(trimmedAddress, destinationChain);

  // Collect warnings (non-blocking issues)
  const warnings: string[] = [];

  // Add warning for non-checksummed EVM addresses
  if (result.chainType === 'EVM' && result.normalizedAddress !== trimmedAddress) {
    warnings.push('Address checksum detected. Consider using the checksummed version.');
  }

  return {
    isValid: result.isValid,
    errorMessage: result.error,
    warnings,
  };
}

/**
 * Batch validate multiple addresses
 * Useful for validating both source and destination addresses
 */
export function batchValidateAddresses(
  addresses: Array<{ address: string; chain: string; label: string }>
): Record<string, ValidationResult> {
  const results: Record<string, ValidationResult> = {};

  addresses.forEach(({ address, chain, label }) => {
    results[label] = validateAddress(address, chain);
  });

  return results;
}

/**
 * Get validation rules for a specific chain
 * Useful for displaying help text in UI
 */
export function getChainValidationRules(chain: string): {
  chainType: ChainType;
  format: string;
  example: string;
  requirements: string[];
} {
  const chainLower = chain.toLowerCase();

  const evmChains = [
    'ethereum',
    'polygon',
    'bsc',
    'arbitrum',
    'optimism',
    'base',
    'avalanche',
    'fantom',
    'cronos',
    'gnosis',
  ];

  if (evmChains.some(c => chainLower.includes(c))) {
    return {
      chainType: 'EVM',
      format: '0x followed by 40 hexadecimal characters',
      example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      requirements: [
        'Must start with 0x',
        'Must be exactly 42 characters long',
        'Contains only hexadecimal characters (0-9, a-f, A-F)',
        'Case-sensitive (checksum encoding)',
      ],
    };
  }

  if (['stellar'].some(c => chainLower.includes(c))) {
    return {
      chainType: 'Stellar',
      format: 'G followed by 55 alphanumeric characters',
      example: 'GDBS7DQXHZ4ZVQZJ6XQFZQPZ7XQFZQPZ7XQFZQPZ7XQFZQPZ7XQFZQPZ',
      requirements: [
        'Must start with G',
        'Must be exactly 56 characters long',
        'Contains only uppercase letters and numbers (A-Z, 2-7)',
        'Valid StrKey encoded Ed25519 public key',
      ],
    };
  }

  throw new Error(`Unknown chain: ${chain}`);
}
