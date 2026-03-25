/**
 * @bridgewise/bridge-core/unified-adapter
 *
 * Unified Bridge Adapter Interface providing a standardized, plug-and-play
 * system for integrating multiple blockchain bridges with:
 * - Standardized fee structures
 * - Cross-chain token mapping
 * - Flexible configuration
 * - Easy extensibility
 */

export type {
  BridgeAdapter,
  BridgeAdapterConfig,
  NormalizedFee,
  BridgeTokenMapping,
} from './adapter.interface';
export type { TokenMapping, ITokenRegistry } from './token-registry.interface';
export type {
  AdapterMetadata,
  BridgeConfig,
  BridgeCapabilities,
} from './bridge-config.interface';

export { BaseBridgeAdapter } from './base-adapter';
export {
  AdapterFactory,
  getAdapterFactory,
  resetAdapterFactory,
} from './adapter-factory';
export { TokenRegistry } from './token-registry';
export { FeeNormalizer } from './fee-normalizer';

export { ADAPTER_ERRORS, AdapterError } from './errors';
export { validateAdapterConfig, validateTokenMapping } from './validators';
