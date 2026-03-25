"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTokenMapping = exports.validateAdapterConfig = exports.AdapterError = exports.ADAPTER_ERRORS = exports.FeeNormalizer = exports.TokenRegistry = exports.resetAdapterFactory = exports.getAdapterFactory = exports.AdapterFactory = exports.BaseBridgeAdapter = void 0;
var base_adapter_1 = require("./base-adapter");
Object.defineProperty(exports, "BaseBridgeAdapter", { enumerable: true, get: function () { return base_adapter_1.BaseBridgeAdapter; } });
var adapter_factory_1 = require("./adapter-factory");
Object.defineProperty(exports, "AdapterFactory", { enumerable: true, get: function () { return adapter_factory_1.AdapterFactory; } });
Object.defineProperty(exports, "getAdapterFactory", { enumerable: true, get: function () { return adapter_factory_1.getAdapterFactory; } });
Object.defineProperty(exports, "resetAdapterFactory", { enumerable: true, get: function () { return adapter_factory_1.resetAdapterFactory; } });
var token_registry_1 = require("./token-registry");
Object.defineProperty(exports, "TokenRegistry", { enumerable: true, get: function () { return token_registry_1.TokenRegistry; } });
var fee_normalizer_1 = require("./fee-normalizer");
Object.defineProperty(exports, "FeeNormalizer", { enumerable: true, get: function () { return fee_normalizer_1.FeeNormalizer; } });
var errors_1 = require("./errors");
Object.defineProperty(exports, "ADAPTER_ERRORS", { enumerable: true, get: function () { return errors_1.ADAPTER_ERRORS; } });
Object.defineProperty(exports, "AdapterError", { enumerable: true, get: function () { return errors_1.AdapterError; } });
var validators_1 = require("./validators");
Object.defineProperty(exports, "validateAdapterConfig", { enumerable: true, get: function () { return validators_1.validateAdapterConfig; } });
Object.defineProperty(exports, "validateTokenMapping", { enumerable: true, get: function () { return validators_1.validateTokenMapping; } });
//# sourceMappingURL=index.js.map