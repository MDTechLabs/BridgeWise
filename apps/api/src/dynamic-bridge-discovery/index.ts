// Module

// Services
export { BridgeService } from './bridge.service';

// Decorators
export {
  BridgePlugin,
  InjectBridgeRegistry,
  BRIDGE_ADAPTER_METADATA,
} from './bridge.decorators';

// Tokens
export {
  BRIDGE_MODULE_CONFIG,
  BRIDGE_ADAPTER_TOKEN,
  BRIDGE_REGISTRY_TOKEN,
} from './bridge.tokens';

// Exceptions
export {
  BridgeNotFoundException,
  BridgeDuplicateException,
  BridgeInitializationException,
  BridgeLoadException,
  BridgeCapabilityNotFoundException,
} from './bridge.exceptions';

// Example adapters (not for production use — illustrative only)
export { HttpBridgeAdapter } from './http-bridge.adapter';
export { WebSocketBridgeAdapter } from './websocket-bridge.adapter';
export { DemoBridgeAdapter } from './demo-bridge.adapter';
