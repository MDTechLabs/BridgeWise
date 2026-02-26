import { BridgeAdapter, BridgeCapability } from '../interfaces/bridge-adapter.interface';
import { BridgePlugin } from '../decorators/bridge.decorators';

@BridgePlugin({ name: 'ws-bridge', version: '1.0.0' })
export class WebSocketBridgeAdapter implements BridgeAdapter {
  readonly name = 'ws-bridge';
  readonly version = '1.0.0';
  readonly capabilities: BridgeCapability[] = [
    { name: 'websocket', version: '1.0.0', description: 'WebSocket communication' },
    { name: 'realtime', version: '1.0.0', description: 'Real-time event streaming' },
  ];

  private wsUrl: string = '';
  private initialized = false;

  constructor(private readonly config: Record<string, unknown> = {}) {}

  async initialize(config?: Record<string, unknown>): Promise<void> {
    const merged = { ...this.config, ...(config ?? {}) };
    this.wsUrl = (merged['wsUrl'] as string) ?? 'ws://localhost';
    this.initialized = true;
  }

  async isHealthy(): Promise<boolean> {
    return this.initialized;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  async execute<T = unknown, R = unknown>(operation: string, payload: T): Promise<R> {
    if (!this.initialized) throw new Error('WebSocketBridgeAdapter not initialized');

    return { operation, payload, wsUrl: this.wsUrl, bridge: this.name } as unknown as R;
  }
}
