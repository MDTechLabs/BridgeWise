"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompatibilityError = exports.CompatibilityErrorHandler = exports.TokenMappingRegistry = exports.RouteValidationEngine = exports.TokenPairCompatibilityService = exports.TokenPairErrorCode = void 0;
// Enums
var types_1 = require("./types");
Object.defineProperty(exports, "TokenPairErrorCode", { enumerable: true, get: function () { return types_1.TokenPairErrorCode; } });
// Services
var compatibility_service_1 = require("./compatibility-service");
Object.defineProperty(exports, "TokenPairCompatibilityService", { enumerable: true, get: function () { return compatibility_service_1.TokenPairCompatibilityService; } });
// Validation Engine
var validation_engine_1 = require("./validation-engine");
Object.defineProperty(exports, "RouteValidationEngine", { enumerable: true, get: function () { return validation_engine_1.RouteValidationEngine; } });
// Token Registry
var token_mapping_registry_1 = require("./token-mapping-registry");
Object.defineProperty(exports, "TokenMappingRegistry", { enumerable: true, get: function () { return token_mapping_registry_1.TokenMappingRegistry; } });
// Error Handling
var errors_1 = require("./errors");
Object.defineProperty(exports, "CompatibilityErrorHandler", { enumerable: true, get: function () { return errors_1.CompatibilityErrorHandler; } });
Object.defineProperty(exports, "CompatibilityError", { enumerable: true, get: function () { return errors_1.CompatibilityError; } });
//# sourceMappingURL=index.js.map