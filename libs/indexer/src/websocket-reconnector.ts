/**
 * libs/indexer/src/websocket-reconnector.ts
 *
 * WebSocket Reconnector
 * ----------------------
 * Wraps an RPC WebSocket/subscription connection (bridge event listeners
 * watching for `MessageSent`, `TokensLocked`, etc.) with automatic
 * reconnection: exponential backoff with jitter on connection drops, and a
 * `backfill` event describing the block range that was missed while
 * disconnected so the caller can re-subscribe to / replay those blocks.
 *
 * The reconnector doesn't know anything about a specific RPC provider's SDK.
 * It's driven by a caller-supplied `connect()` factory that returns anything
 * shaped like a WebSocket (open/message/error/close events), so it works the
 * same whether the underlying connection is `ws`, an ethers provider socket,
 * or a Soroban RPC subscription.
 */

import { EventEmitter } from 'events';

/** Minimal WebSocket-like surface the reconnector depends on. */
export interface WebSocketLike {
  close(): void;
  on(event: 'open', listener: () => void): void;
  on(event: 'message', listener: (data: unknown) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  on(event: 'close', listener: (code?: number, reason?: string) => void): void;
}

export type ConnectionFactory = () => WebSocketLike | Promise<WebSocketLike>;

/** Block range that was missed while the connection was down. */
export interface BackfillRange {
  chainId: number;
  /** First missed block, inclusive. */
  fromBlock: number;
  /** Chain tip at the moment of reconnection, inclusive. */
  toBlock: number;
}

export type BackfillHandler = (range: BackfillRange) => void | Promise<void>;

export interface WebSocketReconnectorOptions {
  chainId: number;
  /** Opens a new connection. Called on start and on every reconnect attempt. */
  connect: ConnectionFactory;
  /** Base delay, in ms, for the exponential backoff calculation. Default 1000. */
  baseDelayMs?: number;
  /** Upper bound on the computed backoff delay, in ms. Default 30000. */
  maxDelayMs?: number;
  /** Consecutive failed attempts allowed before giving up and emitting `exhausted`. Default Infinity. */
  maxAttempts?: number;
  /** Returns the last block height this listener has fully processed. Used to compute backfill ranges. */
  getLastProcessedBlock?: () => number | Promise<number>;
  /** Returns the chain's current tip height. Used to compute backfill ranges. */
  getLatestBlock?: () => number | Promise<number>;
  /** Convenience callback invoked with the missed range on reconnect, in addition to the `backfill` event. */
  onBackfill?: BackfillHandler;
}

/**
 * Declaration merging: gives `.on()` / `.once()` / `.emit()` typed payloads
 * instead of the default EventEmitter signature.
 */
export declare interface WebSocketReconnector {
  on(event: 'open', listener: () => void): this;
  on(event: 'message', listener: (data: unknown) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'disconnected', listener: (info: { code?: number; reason?: string }) => void): this;
  on(event: 'reconnecting', listener: (info: { attempt: number; delayMs: number }) => void): this;
  on(event: 'reconnected', listener: (info: { attempts: number }) => void): this;
  on(event: 'backfill', listener: (range: BackfillRange) => void): this;
  on(event: 'exhausted', listener: (info: { attempts: number }) => void): this;
  once(event: 'open', listener: () => void): this;
  once(event: 'reconnected', listener: (info: { attempts: number }) => void): this;
  emit(event: 'open'): boolean;
  emit(event: 'message', data: unknown): boolean;
  emit(event: 'error', err: Error): boolean;
  emit(event: 'disconnected', info: { code?: number; reason?: string }): boolean;
  emit(event: 'reconnecting', info: { attempt: number; delayMs: number }): boolean;
  emit(event: 'reconnected', info: { attempts: number }): boolean;
  emit(event: 'backfill', range: BackfillRange): boolean;
  emit(event: 'exhausted', info: { attempts: number }): boolean;
}

export class WebSocketReconnector extends EventEmitter {
  private readonly chainId: number;
  private readonly connectFn: ConnectionFactory;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxAttempts: number;
  private readonly getLastProcessedBlock?: () => number | Promise<number>;
  private readonly getLatestBlock?: () => number | Promise<number>;
  private readonly onBackfill?: BackfillHandler;

  private socket: WebSocketLike | null = null;
  private attempt = 0;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: WebSocketReconnectorOptions) {
    super();
    this.chainId = options.chainId;
    this.connectFn = options.connect;
    this.baseDelayMs = options.baseDelayMs ?? 1_000;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? Infinity;
    this.getLastProcessedBlock = options.getLastProcessedBlock;
    this.getLatestBlock = options.getLatestBlock;
    this.onBackfill = options.onBackfill;
  }

  /** True while a live connection is established. */
  get isConnected(): boolean {
    return this.socket !== null;
  }

  /** Number of consecutive failed reconnect attempts since the last successful connection. */
  get currentAttempt(): number {
    return this.attempt;
  }

  /** Open the initial connection. Safe to call again after `stop()`. */
  async start(): Promise<void> {
    this.stopped = false;
    this.attempt = 0;
    await this.establishConnection();
  }

  /** Close the connection and cancel any pending reconnect attempt. */
  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private async establishConnection(): Promise<void> {
    let socket: WebSocketLike;
    try {
      socket = await this.connectFn();
    } catch (err) {
      this.handleDrop(undefined, (err as Error).message);
      return;
    }

    if (this.stopped) {
      // start()/stop() raced; discard the connection we just opened.
      socket.close();
      return;
    }

    this.socket = socket;
    socket.on('open', () => this.handleOpen());
    socket.on('message', (data) => this.emit('message', data));
    socket.on('error', (err) => this.emit('error', err));
    socket.on('close', (code, reason) => this.handleDrop(code, reason));
  }

  private handleOpen(): void {
    const attemptsTaken = this.attempt;
    this.attempt = 0;
    this.emit('open');

    if (attemptsTaken > 0) {
      this.emit('reconnected', { attempts: attemptsTaken });
      void this.backfillMissedRange();
    }
  }

  private handleDrop(code?: number, reason?: string): void {
    this.socket = null;
    if (this.stopped) return;

    this.emit('disconnected', { code, reason });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.attempt >= this.maxAttempts) {
      this.emit('exhausted', { attempts: this.attempt });
      return;
    }

    this.attempt += 1;
    const delayMs = this.computeBackoffDelay(this.attempt);
    this.emit('reconnecting', { attempt: this.attempt, delayMs });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.establishConnection();
    }, delayMs);
  }

  /**
   * Exponential backoff with jitter: `2^attempt * baseDelayMs`, capped at
   * `maxDelayMs`, plus a random jitter in `[0, baseDelayMs)` so a fleet of
   * listeners reconnecting after a shared outage doesn't thunder the RPC
   * node all at once.
   */
  private computeBackoffDelay(attempt: number): number {
    const exponential = 2 ** attempt * this.baseDelayMs;
    const jitter = Math.random() * this.baseDelayMs;
    return Math.min(this.maxDelayMs, exponential + jitter);
  }

  private async backfillMissedRange(): Promise<void> {
    if (!this.getLastProcessedBlock || !this.getLatestBlock) return;

    try {
      const [lastProcessed, latest] = await Promise.all([
        Promise.resolve(this.getLastProcessedBlock()),
        Promise.resolve(this.getLatestBlock()),
      ]);

      if (latest <= lastProcessed) return;

      const range: BackfillRange = {
        chainId: this.chainId,
        fromBlock: lastProcessed + 1,
        toBlock: latest,
      };

      this.emit('backfill', range);
      if (this.onBackfill) await this.onBackfill(range);
    } catch (err) {
      this.emit('error', err as Error);
    }
  }
}
