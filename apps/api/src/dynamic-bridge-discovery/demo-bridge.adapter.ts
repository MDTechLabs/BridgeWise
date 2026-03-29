import { BridgeAdapter, BridgeCapability } from './bridge-adapter.interface';
import { BridgePlugin } from './bridge.decorators';

@BridgePlugin({ name: 'demo-bridge', version: '0.1.0' })
export class DemoBridgeAdapter implements BridgeAdapter {
  readonly name = 'demo-bridge';
  readonly version = '0.1.0';
  readonly capabilities: BridgeCapability[] = [
    { name: 'demo', version: '1.0.0', description: 'Demo bridge for plugin architecture' },
  ];

  private initialized = false;

  async initialize(config?: Record<string, unknown>): Promise<void> {
    this.initialized = true;
  }

  async isHealthy(): Promise<boolean> {
    return this.initialized;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  async execute<T = unknown, R = unknown>(operation: string, payload: T): Promise<R> {
    if (!this.initialized) {
      throw new Error('DemoBridgeAdapter not initialized');
    }

    return {
      operation,
      payload,
      handledBy: this.name,
    } as unknown as R;
  }
}
