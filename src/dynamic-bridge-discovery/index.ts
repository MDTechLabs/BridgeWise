// Module
export { BridgeModule } from './module/bridge.module';

// Services
export { BridgeService } from './bridge.service';
export { BridgeRegistry } from './registry/bridge.registry';
export { BridgeLoader } from './loaders/bridge.loader';

// Interfaces
export { BridgeAdapter, BridgeCapability, BridgeAdapterConstructor } from './interfaces/bridge-adapter.interface';
export { BridgeModuleConfig, BridgeAdapterConfig } from './interfaces/bridge-config.interface';

// Decorators
export { BridgePlugin, InjectBridgeRegistry, BRIDGE_ADAPTER_METADATA } from './decorators/bridge.decorators';

// Tokens
export { BRIDGE_MODULE_CONFIG, BRIDGE_ADAPTER_TOKEN, BRIDGE_REGISTRY_TOKEN } from './interfaces/bridge.tokens';

// Exceptions
export {
  BridgeNotFoundException,
  BridgeDuplicateException,
  BridgeInitializationException,
  BridgeLoadException,
  BridgeCapabilityNotFoundException,
} from './exceptions/bridge.exceptions';

// Example adapters (not for production use — illustrative only)
export { HttpBridgeAdapter } from './adapters/http-bridge.adapter';
export { WebSocketBridgeAdapter } from './adapters/websocket-bridge.adapter';
