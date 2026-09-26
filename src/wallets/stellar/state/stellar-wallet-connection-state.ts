/**
 * Stellar Wallet Connection State Manager
 *
 * Centralizes Stellar wallet connection state for BridgeWise components.
 * Tracks connection status, active account, disconnection detection,
 * and account changes using an event-driven pub/sub pattern.
 */

import type { WalletAccount, WalletAdapter } from '../../../packages/wallet/src';

// ─── State Types ────────────────────────────────────────────────────────────

export type StellarConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export interface StellarWalletConnectionState {
  /** Current connection status */
  status: StellarConnectionStatus;
  /** The connected Stellar account, or null if disconnected */
  account: WalletAccount | null;
  /** The wallet adapter ID used for the current connection */
  adapterId: string | null;
  /** Last error if status is 'error' */
  error: string | null;
  /** Timestamp of last state change */
  lastChangedAt: number;
  /** Timestamp of last successful connection */
  connectedAt: number | null;
}

export type StellarConnectionEventType =
  | 'statusChanged'
  | 'accountChanged'
  | 'accountDisconnected'
  | 'error';

export interface StellarConnectionStatusChangeEvent {
  type: 'statusChanged';
  previous: StellarConnectionStatus;
  current: StellarConnectionStatus;
  timestamp: number;
}

export interface StellarConnectionAccountChangeEvent {
  type: 'accountChanged';
  previous: WalletAccount | null;
  current: WalletAccount;
  timestamp: number;
}

export interface StellarConnectionAccountDisconnectEvent {
  type: 'accountDisconnected';
  previous: WalletAccount;
  timestamp: number;
}

export interface StellarConnectionErrorEvent {
  type: 'error';
  error: string;
  timestamp: number;
}

export type StellarConnectionEvent =
  | StellarConnectionStatusChangeEvent
  | StellarConnectionAccountChangeEvent
  | StellarConnectionAccountDisconnectEvent
  | StellarConnectionErrorEvent;

export type StellarConnectionEventListener = (event: StellarConnectionEvent) => void;

// ─── Default State ──────────────────────────────────────────────────────────

const DEFAULT_STATE: StellarWalletConnectionState = {
  status: 'disconnected',
  account: null,
  adapterId: null,
  error: null,
  lastChangedAt: 0,
  connectedAt: null,
};

// ─── State Manager ──────────────────────────────────────────────────────────

export class StellarWalletConnectionStateManager {
  private state: StellarWalletConnectionState = { ...DEFAULT_STATE };
  private readonly listeners = new Set<StellarConnectionEventListener>();
  private adapter: WalletAdapter | null = null;
  private readonly adapterEventCleanups: Array<() => void> = [];

  /** Get a snapshot of the current state (readonly copy). */
  getState(): Readonly<StellarWalletConnectionState> {
    return { ...this.state };
  }

  /** Get just the connection status. */
  getStatus(): StellarConnectionStatus {
    return this.state.status;
  }

  /** Get the active account, or null. */
  getAccount(): WalletAccount | null {
    return this.state.account;
  }

  /** Whether the wallet is currently connected. */
  isConnected(): boolean {
    return this.state.status === 'connected';
  }

  /** Whether a connect/disconnect operation is in flight. */
  isBusy(): boolean {
    return this.state.status === 'connecting' || this.state.status === 'disconnecting';
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Connect to a Stellar wallet adapter.
   *
   * Transitions: disconnected → connecting → connected | error
   */
  async connect(
    adapter: WalletAdapter,
    chainId?: string,
  ): Promise<WalletAccount> {
    if (this.state.status === 'connected' || this.state.status === 'connecting') {
      if (this.state.adapterId === adapter.id && this.state.status === 'connected') {
        return this.state.account!;
      }
    }

    // Clean up previous adapter listeners if reconnecting to a different adapter
    this.cleanupAdapterListeners();

    this.setStatus('connecting');
    this.adapter = adapter;

    this.subscribeToAdapterEvents(adapter);

    try {
      const account = await adapter.connect(chainId);

      this.setState({
        status: 'connected',
        account,
        adapterId: adapter.id,
        error: null,
        lastChangedAt: Date.now(),
        connectedAt: Date.now(),
      });

      return account;
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);

      this.setState({
        status: 'error',
        account: null,
        adapterId: adapter.id,
        error: errorMessage,
        lastChangedAt: Date.now(),
        connectedAt: null,
      });

      throw error;
    }
  }

  /**
   * Disconnect the current wallet.
   *
   * Transitions: connected → disconnecting → disconnected
   */
  async disconnect(): Promise<void> {
    if (this.state.status === 'disconnected' || this.state.status === 'disconnecting') {
      return;
    }

    const previousAccount = this.state.account;

    this.setStatus('disconnecting');

    try {
      if (this.adapter) {
        await this.adapter.disconnect();
      }

      this.cleanupAdapterListeners();

      this.setState({
        ...DEFAULT_STATE,
        lastChangedAt: Date.now(),
      });

      if (previousAccount) {
        this.emit({
          type: 'accountDisconnected',
          previous: previousAccount,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      // Even if disconnect throws, reset to disconnected
      this.cleanupAdapterListeners();

      this.setState({
        ...DEFAULT_STATE,
        lastChangedAt: Date.now(),
      });

      if (previousAccount) {
        this.emit({
          type: 'accountDisconnected',
          previous: previousAccount,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Manually set the state from an external source (e.g., auto-reconnect).
   * Reconciles the state based on what the adapter reports.
   */
  async reconcile(adapter: WalletAdapter): Promise<void> {
    try {
      const account = await adapter.getAccount();

      if (account) {
        this.adapter = adapter;
        this.subscribeToAdapterEvents(adapter);

        this.setState({
          status: 'connected',
          account,
          adapterId: adapter.id,
          error: null,
          lastChangedAt: Date.now(),
          connectedAt: Date.now(),
        });
      } else {
        this.setState({
          ...DEFAULT_STATE,
          lastChangedAt: Date.now(),
        });
      }
    } catch {
      this.setState({
        ...DEFAULT_STATE,
        lastChangedAt: Date.now(),
      });
    }
  }

  /** Tear down all listeners and state. */
  destroy(): void {
    this.cleanupAdapterListeners();
    this.listeners.clear();
    this.adapter = null;
    this.setState({ ...DEFAULT_STATE });
  }

  // ─── Event Subscriptions ──────────────────────────────────────────────────

  subscribe(listener: StellarConnectionEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onStatusChange(
    listener: (status: StellarConnectionStatus, previous: StellarConnectionStatus) => void,
  ): () => void {
    return this.subscribe((event) => {
      if (event.type === 'statusChanged') {
        listener(event.current, event.previous);
      }
    });
  }

  onAccountChange(
    listener: (account: WalletAccount | null, previous: WalletAccount | null) => void,
  ): () => void {
    return this.subscribe((event) => {
      if (event.type === 'accountChanged') {
        listener(event.current, event.previous);
      } else if (event.type === 'accountDisconnected') {
        listener(null, event.previous);
      }
    });
  }

  onDisconnect(listener: (account: WalletAccount) => void): () => void {
    return this.subscribe((event) => {
      if (event.type === 'accountDisconnected') {
        listener(event.previous);
      }
    });
  }

  onError(listener: (error: string) => void): () => void {
    return this.subscribe((event) => {
      if (event.type === 'error') {
        listener(event.error);
      }
    });
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private setState(partial: Partial<StellarWalletConnectionState>): void {
    const previous = { ...this.state };
    this.state = { ...this.state, ...partial };

    if (previous.status !== this.state.status) {
      this.emit({
        type: 'statusChanged',
        previous: previous.status,
        current: this.state.status,
        timestamp: Date.now(),
      });
    }

    if (previous.account?.address !== this.state.account?.address) {
      if (this.state.account) {
        this.emit({
          type: 'accountChanged',
          previous: previous.account,
          current: this.state.account,
          timestamp: Date.now(),
        });
      }
    }
  }

  private setStatus(status: StellarConnectionStatus): void {
    const previous = this.state.status;
    this.state.status = status;
    this.state.lastChangedAt = Date.now();

    if (previous !== status) {
      this.emit({
        type: 'statusChanged',
        previous,
        current: status,
        timestamp: Date.now(),
      });
    }
  }

  private emit(event: StellarConnectionEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // Swallow listener errors to protect other listeners
      }
    });
  }

  private subscribeToAdapterEvents(adapter: WalletAdapter): void {
    const onDisconnect = () => {
      this.setState({
        status: 'disconnected',
        account: null,
        adapterId: null,
        error: null,
        lastChangedAt: Date.now(),
        connectedAt: null,
      });
    };

    const onAccountsChanged = (data: unknown) => {
      const account = data as WalletAccount | null;

      if (account) {
        const previous = this.state.account;
        this.setState({
          account,
          lastChangedAt: Date.now(),
        });

        if (previous?.address !== account.address) {
          this.emit({
            type: 'accountChanged',
            previous,
            current: account,
            timestamp: Date.now(),
          });
        }
      } else {
        // Account cleared = disconnection
        const previousAccount = this.state.account;

        this.setState({
          status: 'disconnected',
          account: null,
          adapterId: null,
          error: null,
          lastChangedAt: Date.now(),
          connectedAt: null,
        });

        if (previousAccount) {
          this.emit({
            type: 'accountDisconnected',
            previous: previousAccount,
            timestamp: Date.now(),
          });
        }
      }
    };

    const onError = (data: unknown) => {
      const errorData = data as { message?: string } | string;
      const errorMessage =
        typeof errorData === 'string'
          ? errorData
          : errorData?.message || 'Unknown wallet error';

      this.setState({
        error: errorMessage,
        lastChangedAt: Date.now(),
      });

      this.emit({
        type: 'error',
        error: errorMessage,
        timestamp: Date.now(),
      });
    };

    adapter.on('disconnect', onDisconnect);
    adapter.on('accountsChanged', onAccountsChanged);
    adapter.on('error', onError);

    this.adapterEventCleanups.push(() => {
      adapter.off('disconnect', onDisconnect);
      adapter.off('accountsChanged', onAccountsChanged);
      adapter.off('error', onError);
    });
  }

  private cleanupAdapterListeners(): void {
    this.adapterEventCleanups.forEach((cleanup) => cleanup());
    this.adapterEventCleanups.length = 0;
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown wallet connection error';
  }
}

/** Singleton factory for the state manager (useful for non-React code). */
let _instance: StellarWalletConnectionStateManager | null = null;

export function getStellarWalletConnectionState(): StellarWalletConnectionStateManager {
  if (!_instance) {
    _instance = new StellarWalletConnectionStateManager();
  }
  return _instance;
}

export function resetStellarWalletConnectionState(): void {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
