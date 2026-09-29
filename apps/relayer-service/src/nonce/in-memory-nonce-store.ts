import { ChainNonce, NonceStore } from '../types';

/**
 * Process-local nonce storage. This is the default backing store for the
 * executors and reproduces the pre-feature behaviour exactly: nonces survive
 * within one process, but a restart or a second replica starts the counter
 * over. It exists so every executor always has a safe default and so tests
 * and single-instance setups have a zero-configuration store.
 *
 * Once a durable store is configured (see `FileNonceStore`), this should only
 * be used as a cache or in tests.
 */
export class InMemoryNonceStore implements NonceStore {
  private readonly chainNonces = new Map<string, number>();
  private readonly messageNonces = new Map<string, ChainNonce>();
  private readonly maxMessageNonces: number;
  private evicted = 0;

  constructor(options: { maxMessageNonces?: number } = {}) {
    this.maxMessageNonces = options.maxMessageNonces ?? 100_000;
  }

  async getNonce(chainId: string): Promise<number | null> {
    return this.chainNonces.get(chainId) ?? null;
  }

  async setNonce(chainId: string, nonce: number): Promise<void> {
    this.chainNonces.set(chainId, nonce);
  }

  async getMessageNonce(messageId: string): Promise<ChainNonce | null> {
    return this.messageNonces.get(messageId) ?? null;
  }

  async setMessageNonce(messageId: string, chainId: string, nonce: number): Promise<void> {
    if (!this.messageNonces.has(messageId)) {
      if (this.messageNonces.size >= this.maxMessageNonces) {
        const oldest = this.messageNonces.keys().next().value;
        if (oldest !== undefined) {
          this.messageNonces.delete(oldest);
          this.evicted++;
        }
      }
    }
    this.messageNonces.set(messageId, { chainId, nonce });
  }

  async removeMessageNonce(messageId: string): Promise<void> {
    this.messageNonces.delete(messageId);
  }

  clear(): void {
    this.chainNonces.clear();
    this.messageNonces.clear();
    this.evicted = 0;
  }

  getChainNonces(): Array<[string, number]> {
    return Array.from(this.chainNonces);
  }

  getMessagePins(): Array<[string, ChainNonce]> {
    return Array.from(this.messageNonces);
  }

  getStats(): { chains: number; messages: number; evicted: number } {
    return {
      chains: this.chainNonces.size,
      messages: this.messageNonces.size,
      evicted: this.evicted,
    };
  }
}