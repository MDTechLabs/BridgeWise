import { EventEmitter } from 'events';
import { BridgeEventPayload, SubscriberConfig } from './stellar-event-subscriber';

export class EVMLogSubscriber extends EventEmitter {
  private config: SubscriberConfig;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxAttempts: number;
  private currentBackoffMs: number;
  private mockWsTimer: NodeJS.Timeout | null = null;

  constructor(config: SubscriberConfig) {
    super();
    this.config = config;
    this.maxAttempts = config.reconnectMaxAttempts || 5;
    this.currentBackoffMs = config.initialBackoffMs || 100;
  }

  public async connect(): Promise<void> {
    try {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.currentBackoffMs = this.config.initialBackoffMs || 100;
      this.emit('connected', { rpcWsUrl: this.config.rpcWsUrl });
    } catch (err) {
      await this.handleDisconnect();
    }
  }

  public disconnect(): void {
    this.isConnected = false;
    if (this.mockWsTimer) {
      clearTimeout(this.mockWsTimer);
      this.mockWsTimer = null;
    }
    this.emit('disconnected');
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  public handleDisconnect(): Promise<void> {
    this.isConnected = false;
    this.emit('disconnected');

    if (this.reconnectAttempts >= this.maxAttempts) {
      this.emit('reconnect_failed', { attempts: this.reconnectAttempts });
      return Promise.reject(new Error('Max reconnection attempts reached'));
    }

    this.reconnectAttempts++;
    const currentAttempt = this.reconnectAttempts;
    const backoff = this.currentBackoffMs;
    this.currentBackoffMs *= 2; // Exponential backoff

    return new Promise((resolve) => {
      this.mockWsTimer = setTimeout(async () => {
        await this.connect();
        this.emit('reconnected', { attempt: currentAttempt });
        resolve();
      }, backoff);
    });
  }

  public simulateEvent(payload: Partial<BridgeEventPayload>): void {
    if (!this.isConnected) {
      throw new Error('EVMLogSubscriber is not connected');
    }

    const fullPayload: BridgeEventPayload = {
      txHash: payload.txHash || '0xevm_default_hash',
      chain: payload.chain || 'ethereum',
      topic: payload.topic || 'MessageSent',
      status: payload.status || 'In-Flight',
      fromAddress: payload.fromAddress || '0x999...def',
      toAddress: payload.toAddress || '0x888...ghi',
      amount: payload.amount || '50000000',
      contractAddress: payload.contractAddress || this.config.contractAddresses[0] || '0xEVM_CONTRACT',
      blockNumber: payload.blockNumber || 9876543,
      timestamp: payload.timestamp || Date.now(),
    };

    this.emit('event', fullPayload);
  }
}
