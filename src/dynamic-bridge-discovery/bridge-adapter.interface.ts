export interface BridgeCapability {
  name: string;
  version: string;
  description?: string;
}

export interface BridgeAdapter {
  readonly name: string;
  readonly version: string;
  readonly capabilities: BridgeCapability[];

  initialize(config?: Record<string, unknown>): Promise<void>;
  isHealthy(): Promise<boolean>;
  shutdown(): Promise<void>;
  execute<T = unknown, R = unknown>(operation: string, payload: T): Promise<R>;
}

export interface BridgeAdapterConstructor {
  new (config?: Record<string, unknown>): BridgeAdapter;
}
