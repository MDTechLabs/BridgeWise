/**
 * Shared Chain Configuration Schema
 * Used across all BridgeWise packages
 */

export interface ChainFeatures {
  supportsBridging: boolean;
  supportsQuotes: boolean;
  nativeCurrencyDecimals: number;
}

export interface ChainConfig {
  id: string;
  name: string;
  symbol: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  type: 'EVM' | 'Stellar' | 'Cosmos' | 'Solana';
  isTestnet?: boolean;
  features: ChainFeatures;
  logoUrl?: string;
  color?: string;
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface ChainsConfiguration {
  chains: ChainConfig[];
  version: string;
  lastUpdated?: string;
}

export interface ChainConfigOptions {
  fromJson?: boolean;
  fromEnv?: boolean;
  overrideRpcUrls?: Record<string, string>;
  overrideExplorerUrls?: Record<string, string>;
  includeTestnets?: boolean;
  enabledChainIds?: string[];
  validateRpcUrls?: boolean;
  skipValidation?: boolean;
}

export const DEFAULT_CHAIN_TEMPLATE: Partial<ChainConfig> = {
  features: {
    supportsBridging: true,
    supportsQuotes: true,
    nativeCurrencyDecimals: 18,
  },
  type: 'EVM',
  isTestnet: false,
};

export const CHAIN_CONFIG_VALIDATION_RULES = {
  requiredFields: ['id', 'name', 'symbol', 'chainId', 'rpcUrl', 'explorerUrl', 'type', 'features'],
  idPattern: /^[a-z0-9-]+$/,
  minChainId: 0,
  maxChainId: 2147483647,
  validTypes: ['EVM', 'Stellar', 'Cosmos', 'Solana'],
  minNativeDecimals: 0,
  maxNativeDecimals: 36,
};

export const CHAIN_TYPES = {
  EVM: 'EVM' as const,
  STELLAR: 'Stellar' as const,
  COSMOS: 'Cosmos' as const,
  SOLANA: 'Solana' as const,
};

export const COMMON_EVM_CHAIN_IDS = {
  ETHEREUM: 1,
  GOERLI: 5,
  POLYGON: 137,
  MUMBAI: 80001,
  BSC: 56,
  BSC_TESTNET: 97,
  ARBITRUM: 42161,
  ARBITRUM_SEPOLIA: 421614,
  OPTIMISM: 10,
  OPTIMISM_SEPOLIA: 11155420,
  BASE: 8453,
  BASE_SEPOLIA: 84532,
  AVAX: 43114,
  AVAX_FUJI: 43113,
  FANTOM: 250,
  FANTOM_TESTNET: 4002,
  GNOSIS: 100,
  CELO: 42220,
  CELO_ALFAJORES: 44787,
  MOONBEAM: 1284,
};

export function validateChainConfig(chain: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of CHAIN_CONFIG_VALIDATION_RULES.requiredFields) {
    if (!(field in chain)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (chain.id && !CHAIN_CONFIG_VALIDATION_RULES.idPattern.test(chain.id)) {
    errors.push(
      `Invalid chain ID format. Must match pattern ${CHAIN_CONFIG_VALIDATION_RULES.idPattern.source}`,
    );
  }

  if (chain.chainId !== undefined) {
    const chainId = Number(chain.chainId);
    if (!Number.isInteger(chainId)) {
      errors.push('chainId must be an integer');
    } else if (chainId < CHAIN_CONFIG_VALIDATION_RULES.minChainId) {
      errors.push(`chainId must be >= ${CHAIN_CONFIG_VALIDATION_RULES.minChainId}`);
    } else if (chainId > CHAIN_CONFIG_VALIDATION_RULES.maxChainId) {
      errors.push(`chainId must be <= ${CHAIN_CONFIG_VALIDATION_RULES.maxChainId}`);
    }
  }

  if (chain.type && !CHAIN_CONFIG_VALIDATION_RULES.validTypes.includes(chain.type)) {
    errors.push(
      `Invalid type. Must be one of: ${CHAIN_CONFIG_VALIDATION_RULES.validTypes.join(', ')}`,
    );
  }

  if (chain.rpcUrl) {
    try {
      new URL(chain.rpcUrl);
    } catch {
      errors.push('Invalid rpcUrl format');
    }
  }

  if (chain.explorerUrl) {
    try {
      new URL(chain.explorerUrl);
    } catch {
      errors.push('Invalid explorerUrl format');
    }
  }

  if (chain.features) {
    const decimals = chain.features.nativeCurrencyDecimals;
    if (
      decimals !== undefined &&
      (decimals < CHAIN_CONFIG_VALIDATION_RULES.minNativeDecimals ||
        decimals > CHAIN_CONFIG_VALIDATION_RULES.maxNativeDecimals)
    ) {
      errors.push(
        `nativeCurrencyDecimals must be between ${CHAIN_CONFIG_VALIDATION_RULES.minNativeDecimals} and ${CHAIN_CONFIG_VALIDATION_RULES.maxNativeDecimals}`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function isValidChainConfig(obj: any): obj is ChainConfig {
  return validateChainConfig(obj).valid;
}
