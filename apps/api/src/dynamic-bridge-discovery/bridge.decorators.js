"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgePlugin = exports.BRIDGE_ADAPTER_METADATA = exports.InjectBridgeRegistry = void 0;
const common_1 = require("@nestjs/common");
const bridge_tokens_1 = require("./bridge.tokens");
/**
 * Injects the BridgeRegistry service.
 */
const InjectBridgeRegistry = () => (0, common_1.Inject)(bridge_tokens_1.BRIDGE_REGISTRY_TOKEN);
exports.InjectBridgeRegistry = InjectBridgeRegistry;
/**
 * Metadata key to mark a class as a BridgeAdapter plugin.
 */
exports.BRIDGE_ADAPTER_METADATA = 'BRIDGE_ADAPTER_METADATA';
/**
 * Decorator to mark a class as a discoverable BridgeAdapter.
 *
 * @example
 * @BridgePlugin({ name: 'my-bridge', version: '1.0.0' })
 * export class MyBridgeAdapter implements BridgeAdapter { ... }
 */
const BridgePlugin = (meta) => {
    return (target) => {
        Reflect.defineMetadata(exports.BRIDGE_ADAPTER_METADATA, meta, target);
    };
};
exports.BridgePlugin = BridgePlugin;
//# sourceMappingURL=bridge.decorators.js.map