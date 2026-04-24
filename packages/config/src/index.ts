/**
 * BridgeWise Shared Configuration Package
 * Provides reusable chain configuration utilities for all packages
 */

export {
  ChainConfig,
  ChainFeatures,
  ChainsConfiguration,
  ChainConfigOptions,
  CHAIN_TYPES,
  COMMON_EVM_CHAIN_IDS,
  DEFAULT_CHAIN_TEMPLATE,
  CHAIN_CONFIG_VALIDATION_RULES,
  validateChainConfig,
  isValidChainConfig,
} from './chain-config-schema';

export { ChainConfigManager } from './chain-config-manager';
export { ChainRegistry } from './chain-registry';
export type { ChainQueryOptions, ChainQueryResult } from './chain-query';
export { createChainQuery } from './chain-query';
export {
  TokenRegistry,
  defaultTokenRegistry,
} from './token-registry';
export type { TokenMetadata } from './token-registry';
