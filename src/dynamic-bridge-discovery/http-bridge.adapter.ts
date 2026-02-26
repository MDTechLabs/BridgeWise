import { BridgeAdapter, BridgeCapability } from '../interfaces/bridge-adapter.interface';
import { BridgePlugin } from '../decorators/bridge.decorators';

@BridgePlugin({ name: 'http-bridge', version: '1.0.0' })
export class HttpBridgeAdapter implements BridgeAdapter {
  readonly name = 'http-bridge';
  readonly version = '1.0.0';
  readonly capabilities: BridgeCapability[] = [
    { name: 'http', version: '1.0.0', description: 'HTTP request execution' },
    { name: 'rest', version: '1.0.0', description: 'REST API calls' },
  ];

  private baseUrl: string = '';
  private initialized = false;

  constructor(private readonly config: Record<string, unknown> = {}) {}

  async initialize(config?: Record<string, unknown>): Promise<void> {
    const merged = { ...this.config, ...(config ?? {}) };
    this.baseUrl = (merged['baseUrl'] as string) ?? 'http://localhost';
    this.initialized = true;
  }

  async isHealthy(): Promise<boolean> {
    return this.initialized;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  async execute<T = unknown, R = unknown>(operation: string, payload: T): Promise<R> {
    if (!this.initialized) throw new Error('HttpBridgeAdapter not initialized');

    // Simulated execution — replace with actual HTTP client logic
    return { operation, payload, baseUrl: this.baseUrl, bridge: this.name } as unknown as R;
  }
}
