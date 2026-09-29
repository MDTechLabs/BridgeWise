import { EventEmitter } from 'events';
import { NonceStore } from '../types';
import { InMemoryNonceStore } from './in-memory-nonce-store';

export interface NonceManagerOptions {
  /** Backing store. Defaults to a process-local `InMemoryNonceStore`. */
  store?: NonceStore;
  /** Starting in-memory value when the store has none for the chain. Defaults to 0. */
  startNonce?: number;
  /** Rewrite `updateNonce` semantics: raise-only, never lower. Defaults to true. */
  raiseOnly?: boolean;
}

/**
 * Hands out strictly increasing per-chain nonces for message delivery and
 * makes sure the same message always receives the same nonce.
 *
 * Guarantees:
 *
 * - **No reuse, even across a crash.** A nonce is persisted (chain high-water
 *   and the per-message pin) *before* the executor is allowed to broadcast
 *   with it, so killing the process after the reserve never re-issues it.
 * - **Redelivery is idempotent.** A queue retry, a restart, or a failover that
 *   re-executes the same `messageId` reuses the pinned nonce instead of
 *   minting a new one, which is what prevents double-execution on the
 *   destination chain.
 * - **Serialised.** Concurrent acquisitions are ordered, so two messages can
 *   never receive the same nonce.
 *
 * Events (all carry `chainId`):
 *   `nonce-loaded`   – initial value adopted from the store.
 *   `nonce-assigned` – `{ messageId, nonce }` reserved and persisted.
 *   `nonce-reused`   – `{ messageId, nonce }` a redelivered message reusing its pin.
 *   `nonce-error`    – `{ phase: 'load' | 'persist' | 'release', messageId?, error }`.
 *
 * On a persist failure the in-memory counter is rolled back and the error is
 * rethrown, so the caller fails the delivery instead of burning a nonce it
 * could not record.
 */
export class NonceManager extends EventEmitter {
  readonly chainId: string;
  private readonly store: NonceStore;
  private readonly raiseOnly: boolean;
  private nonce: number;
  private loaded: Promise<void> | null = null;
  private opChain: Promise<void> = Promise.resolve();

  constructor(chainId: string, options: NonceManagerOptions = {}) {
    super();
    this.chainId = chainId;
    this.store = options.store ?? new InMemoryNonceStore();
    this.raiseOnly = options.raiseOnly ?? true;
    this.nonce = options.startNonce ?? 0;
  }

  /** The in-memory view of the next nonce to use for this chain. */
  getNonce(): number {
    return this.nonce;
  }

  /**
   * Sets the next nonce to use. With the default `raiseOnly` semantics lower
   * values are ignored so a stale operator input can never cause a nonce to be
   * reused.
   */
  updateNonce(nonce: number): void {
    if (this.raiseOnly && nonce <= this.nonce) {
      this.emit('nonce-declined', { chainId: this.chainId, nonce });
      return;
    }
    this.nonce = nonce;
  }

  /** Loads the persisted high-water mark for the chain (single flight, retried on failure). */
  async sync(): Promise<void> {
    await this.ensureLoaded();
  }

  /**
   * Reserves a nonce for delivering `messageId` and persists it before
   * returning. A message that already has a pin reuses its original nonce.
   */
  async acquire(messageId: string): Promise<number> {
    await this.ensureLoaded();
    const run = this.opChain.then(async () => {
      const previous = await this.store.getMessageNonce(messageId);
      if (previous && previous.chainId === this.chainId) {
        if (previous.nonce >= this.nonce) {
          this.nonce = previous.nonce + 1;
          await this.persist();
        }
        this.emit('nonce-reused', {
          chainId: this.chainId,
          messageId,
          nonce: previous.nonce,
        });
        return previous.nonce;
      }

      const assigned = this.nonce;
      this.nonce = assigned + 1;
      try {
        await this.store.setNonce(this.chainId, this.nonce);
        await this.store.setMessageNonce(messageId, this.chainId, assigned);
      } catch (error) {
        this.nonce = assigned;
        this.emit('nonce-error', {
          chainId: this.chainId,
          messageId,
          phase: 'persist',
          error: describeError(error),
        });
        throw error;
      }
      this.emit('nonce-assigned', { chainId: this.chainId, messageId, nonce: assigned });
      return assigned;
    });
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Drops the per-message pin once the delivery is confirmed complete, so the
   * store does not grow without bound. Failures are surfaced via `nonce-error`
   * and never abort the delivery.
   */
  async release(messageId: string): Promise<void> {
    const run = this.opChain.then(async () => {
      try {
        await this.store.removeMessageNonce(messageId);
      } catch (error) {
        this.emit('nonce-error', {
          chainId: this.chainId,
          messageId,
          phase: 'release',
          error: describeError(error),
        });
      }
    });
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      this.loaded = this.store
        .getNonce(this.chainId)
        .then((persisted) => {
          if (persisted !== null && persisted > this.nonce) {
            this.nonce = persisted;
          }
          this.emit('nonce-loaded', {
            chainId: this.chainId,
            nonce: this.nonce,
            source: persisted === null ? 'default' : 'store',
          });
        })
        .catch((error) => {
          this.loaded = null;
          this.emit('nonce-error', {
            chainId: this.chainId,
            phase: 'load',
            error: describeError(error),
          });
          throw error;
        });
    }
    return this.loaded;
  }

  private persist(): Promise<void> {
    return this.store.setNonce(this.chainId, this.nonce);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}