/**
 * Token Pair Compatibility Engine
 *
 * Provides validation and filtering for token pairs across bridge providers.
 * Ensures only supported routes are displayed to users.
 *
 * @example
 * ```typescript
 * import { TokenPairCompatibilityService } from '@bridgewise/bridge-core/compatibility';
 *
 * const compatibilityService = new TokenPairCompatibilityService();
 *
 * // Register tokens
 * await compatibilityService.registerToken(
 *   'ethereum',
 *   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
 *   'USDC',
 *   6,
 *   ['hop', 'layerzero']
 * );
 *
 * // Register token mapping
 * await compatibilityService.registerTokenMapping(
 *   'ethereum',
 *   'polygon',
 *   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
 *   '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
 *   'hop',
 *   { minAmount: '1000000', maxAmount: '1000000000000' }
 * );
 *
 * // Get compatible routes
 * const routes = await compatibilityService.getCompatibleRoutes({
 *   sourceChain: 'ethereum',
 *   targetChain: 'polygon',
 *   assetAmount: '1000000000',
 *   tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
 * });
 *
 * if (routes.routes.length === 0) {
 *   console.log('No compatible routes found');
 *   console.log('Filtered routes:', routes.filteredRoutes);
 *   console.log('Alternatives:', routes.alternatives);
 * }
 * ```
 */

// Types
export type {
  TokenPair,
  TokenIdentifier,
  NormalizedToken,
  WrappedTokenMapping,
  TokenPairValidationError,
  TokenPairValidationResult,
  RouteCompatibilityRequest,
  CompatibleRoute,
  CompatibilityTokenMetadata,
  ChainPairSupport,
} from './types';

// Enums
export { TokenPairErrorCode } from './types';

// Services
export { TokenPairCompatibilityService } from './compatibility-service';
export type {
  CompatibilityServiceConfig,
  CompatibilityQuoteRequest,
  CompatibilityQuoteResult,
} from './compatibility-service';

// Validation Engine
export { RouteValidationEngine } from './validation-engine';
export type { ValidationEngineConfig } from './validation-engine';

// Token Registry
export { TokenMappingRegistry } from './token-mapping-registry';

// Error Handling
export {
  CompatibilityErrorHandler,
  CompatibilityError,
  type UserFriendlyError,
} from './errors';

// Re-export for convenience
export type { ChainId, BridgeProvider } from '../types';
