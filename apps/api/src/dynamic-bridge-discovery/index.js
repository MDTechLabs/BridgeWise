"use strict";
// Module
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketBridgeAdapter = exports.HttpBridgeAdapter = exports.BridgeCapabilityNotFoundException = exports.BridgeLoadException = exports.BridgeInitializationException = exports.BridgeDuplicateException = exports.BridgeNotFoundException = exports.BRIDGE_REGISTRY_TOKEN = exports.BRIDGE_ADAPTER_TOKEN = exports.BRIDGE_MODULE_CONFIG = exports.BRIDGE_ADAPTER_METADATA = exports.InjectBridgeRegistry = exports.BridgePlugin = exports.BridgeService = void 0;
// Services
var bridge_service_1 = require("./bridge.service");
Object.defineProperty(exports, "BridgeService", { enumerable: true, get: function () { return bridge_service_1.BridgeService; } });
// Decorators
var bridge_decorators_1 = require("./bridge.decorators");
Object.defineProperty(exports, "BridgePlugin", { enumerable: true, get: function () { return bridge_decorators_1.BridgePlugin; } });
Object.defineProperty(exports, "InjectBridgeRegistry", { enumerable: true, get: function () { return bridge_decorators_1.InjectBridgeRegistry; } });
Object.defineProperty(exports, "BRIDGE_ADAPTER_METADATA", { enumerable: true, get: function () { return bridge_decorators_1.BRIDGE_ADAPTER_METADATA; } });
// Tokens
var bridge_tokens_1 = require("./bridge.tokens");
Object.defineProperty(exports, "BRIDGE_MODULE_CONFIG", { enumerable: true, get: function () { return bridge_tokens_1.BRIDGE_MODULE_CONFIG; } });
Object.defineProperty(exports, "BRIDGE_ADAPTER_TOKEN", { enumerable: true, get: function () { return bridge_tokens_1.BRIDGE_ADAPTER_TOKEN; } });
Object.defineProperty(exports, "BRIDGE_REGISTRY_TOKEN", { enumerable: true, get: function () { return bridge_tokens_1.BRIDGE_REGISTRY_TOKEN; } });
// Exceptions
var bridge_exceptions_1 = require("./bridge.exceptions");
Object.defineProperty(exports, "BridgeNotFoundException", { enumerable: true, get: function () { return bridge_exceptions_1.BridgeNotFoundException; } });
Object.defineProperty(exports, "BridgeDuplicateException", { enumerable: true, get: function () { return bridge_exceptions_1.BridgeDuplicateException; } });
Object.defineProperty(exports, "BridgeInitializationException", { enumerable: true, get: function () { return bridge_exceptions_1.BridgeInitializationException; } });
Object.defineProperty(exports, "BridgeLoadException", { enumerable: true, get: function () { return bridge_exceptions_1.BridgeLoadException; } });
Object.defineProperty(exports, "BridgeCapabilityNotFoundException", { enumerable: true, get: function () { return bridge_exceptions_1.BridgeCapabilityNotFoundException; } });
// Example adapters (not for production use — illustrative only)
var http_bridge_adapter_1 = require("./http-bridge.adapter");
Object.defineProperty(exports, "HttpBridgeAdapter", { enumerable: true, get: function () { return http_bridge_adapter_1.HttpBridgeAdapter; } });
var websocket_bridge_adapter_1 = require("./websocket-bridge.adapter");
Object.defineProperty(exports, "WebSocketBridgeAdapter", { enumerable: true, get: function () { return websocket_bridge_adapter_1.WebSocketBridgeAdapter; } });
//# sourceMappingURL=index.js.map