import { EventEmitter } from 'events';

export type BridgeEventTopic = 'Deposit' | 'MessageSent' | 'TokensClaimed';
export type BridgeTransactionStatus = 'Pending' | 'In-Flight' | 'Completed' | 'Failed';

export interface BridgeEventPayload {
  txHash: string;
  chain: string;
  topic: BridgeEventTopic;
  status: BridgeTransactionStatus;
  fromAddress: string;
  toAddress: string;
  amount: string;
  contractAddress: string;
  blockNumber: number;
  timestamp: number;
}

export interface SubscriberConfig {
  rpcWsUrl: string;
  contractAddresses: string[];
  reconnectMaxAttempts?: number;
  initialBackoffMs?: number;
}

export class StellarEventSubscriber extends EventEmitter {
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
      throw new Error('Subscriber is not connected');
    }

    const fullPayload: BridgeEventPayload = {
      txHash: payload.txHash || '0xstellar_default_hash',
      chain: 'stellar',
      topic: payload.topic || 'Deposit',
      status: payload.status || 'In-Flight',
      fromAddress: payload.fromAddress || 'GABC...123',
      toAddress: payload.toAddress || '0x123...abc',
      amount: payload.amount || '10000000',
      contractAddress: payload.contractAddress || this.config.contractAddresses[0] || 'CSTELLAR_CONTRACT',
      blockNumber: payload.blockNumber || 1234567,
      timestamp: payload.timestamp || Date.now(),
    };

    this.emit('event', fullPayload);
  }
}
