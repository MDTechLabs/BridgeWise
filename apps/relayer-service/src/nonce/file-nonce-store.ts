import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { ChainNonce, FileNonceStoreOptions, NonceStore } from '../types';
import { InMemoryNonceStore } from './in-memory-nonce-store';

const FILE_VERSION = 1;

interface NonceFile {
  version: number;
  nonces: Record<string, number>;
  messageNonces: Record<string, { chainId: string; nonce: number }>;
}

/**
 * Single-instance, file-backed nonce store.
 *
 * The whole state lives in one JSON file (`{ version, nonces, messageNonces }`)
 * that is rewritten atomically on every change: the payload is written to a
 * temporary sibling file, optionally fsynced, then renamed over the target, so
 * an interrupted write can never leave a half-written payload behind. The file
 * is created with owner-only permissions (0600).
 *
 * Security default: a corrupt or unreadable state file fails fast (throws)
 * instead of silently assuming the counter is zero. Resetting a nonce counter
 * to zero after data loss could let the relayer re-issue nonces that the
 * destination chain has already consumed, so an operator should restore the
 * file from backup rather than let the process continue on a blank slate.
 *
 * Like `InMemoryNonceStore`, writes are serialised within this process. The
 * file backend is intended for a single relayer instance: two processes
 * sharing one file must coordinate through a real transactional store (see the
 * `NonceStore` contract) instead.
 */
export class FileNonceStore implements NonceStore {
  private readonly filePath: string;
  private readonly fsync: boolean;
  private readonly memory: InMemoryNonceStore;
  private loaded: boolean = false;
  private loadError: Error | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: FileNonceStoreOptions) {
    this.filePath = options.filePath;
    this.fsync = options.fsync ?? true;
    this.memory = new InMemoryNonceStore({ maxMessageNonces: options.maxMessageNonces });
  }

  async getNonce(chainId: string): Promise<number | null> {
    await this.ensureLoaded();
    return this.memory.getNonce(chainId);
  }

  async setNonce(chainId: string, nonce: number): Promise<void> {
    await this.ensureLoaded();
    return this.enqueue(async () => {
      await this.memory.setNonce(chainId, nonce);
      this.persist();
    });
  }

  async getMessageNonce(messageId: string): Promise<ChainNonce | null> {
    await this.ensureLoaded();
    return this.memory.getMessageNonce(messageId);
  }

  async setMessageNonce(messageId: string, chainId: string, nonce: number): Promise<void> {
    await this.ensureLoaded();
    return this.enqueue(async () => {
      await this.memory.setMessageNonce(messageId, chainId, nonce);
      this.persist();
    });
  }

  async removeMessageNonce(messageId: string): Promise<void> {
    await this.ensureLoaded();
    return this.enqueue(async () => {
      await this.memory.removeMessageNonce(messageId);
      this.persist();
    });
  }

  getStats(): { chains: number; messages: number; evicted: number } {
    return this.memory.getStats();
  }

  /** Force a reload from disk. Useful after an external restore or in tests. */
  reload(): void {
    this.loaded = false;
    this.loadError = null;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (this.loadError) throw this.loadError;

    this.memory.clear();
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<NonceFile>;
      if (parsed.version !== FILE_VERSION) {
        throw new Error(`Unsupported nonce file version ${String(parsed.version)}; expected ${FILE_VERSION}`);
      }
      for (const [chainId, nonce] of Object.entries(parsed.nonces ?? {})) {
        if (Number.isInteger(nonce) && nonce >= 0) await this.memory.setNonce(chainId, nonce);
      }
      for (const [messageId, pin] of Object.entries(parsed.messageNonces ?? {})) {
        if (pin && typeof pin.chainId === 'string' && Number.isInteger(pin.nonce) && pin.nonce >= 0) {
          await this.memory.setMessageNonce(messageId, pin.chainId, pin.nonce);
        }
      }
      this.loaded = true;
    } catch (error) {
      if (isMissingFileError(error)) {
        // A fresh deployment has no state yet: an empty store is legitimate.
        this.loaded = true;
      } else {
        this.loadError = new Error(
          `Cannot load nonce state from ${this.filePath}: ${
            error instanceof Error ? error.message : String(error)
          }. Restore the file from backup; refusing to reset nonces to zero.`,
        );
        throw this.loadError;
      }
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const run = this.writeQueue.then(operation);
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private persist(): void {
    const snapshot: NonceFile = {
      version: FILE_VERSION,
      nonces: Object.fromEntries(this.memory.getChainNonces()),
      messageNonces: Object.fromEntries(this.memory.getMessagePins()),
    };
    const payload = `${JSON.stringify(snapshot)}\n`;
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;

    mkdirSync(dirname(this.filePath), { recursive: true });

    if (this.fsync) {
      const handle = openSync(tmpPath, 'w', 0o600);
      try {
        writeFileSync(handle, payload, 'utf8');
        fsyncSync(handle);
      } finally {
        closeSync(handle);
      }
    } else {
      writeFileSync(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
    }

    renameSync(tmpPath, this.filePath);
  }
}

export function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}