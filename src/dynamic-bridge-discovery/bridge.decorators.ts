import { Inject } from '@nestjs/common';
import { BRIDGE_REGISTRY_TOKEN } from '../interfaces/bridge.tokens';

/**
 * Injects the BridgeRegistry service.
 */
export const InjectBridgeRegistry = () => Inject(BRIDGE_REGISTRY_TOKEN);

/**
 * Metadata key to mark a class as a BridgeAdapter plugin.
 */
export const BRIDGE_ADAPTER_METADATA = 'BRIDGE_ADAPTER_METADATA';

/**
 * Decorator to mark a class as a discoverable BridgeAdapter.
 *
 * @example
 * @BridgePlugin({ name: 'my-bridge', version: '1.0.0' })
 * export class MyBridgeAdapter implements BridgeAdapter { ... }
 */
export const BridgePlugin = (meta: { name: string; version: string }): ClassDecorator => {
  return (target) => {
    Reflect.defineMetadata(BRIDGE_ADAPTER_METADATA, meta, target);
  };
};
