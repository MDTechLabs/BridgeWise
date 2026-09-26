import {
  StellarWalletConnectionStateManager,
  getStellarWalletConnectionState,
  resetStellarWalletConnectionState,
} from '../../../src/wallets/stellar/state/stellar-wallet-connection-state';
import type {
  WalletAdapter,
  WalletAccount,
  WalletEvent,
  WalletEventCallback,
} from '../../../packages/wallet/src';

// ─── Mock Adapter ───────────────────────────────────────────────────────────

class MockStellarAdapter implements WalletAdapter {
  readonly id = 'mock-freighter';
  readonly name = 'Mock Freighter';
  readonly type = 'freighter' as const;
  readonly networkType = 'stellar' as const;
  readonly isAvailable = true;
  readonly icon = undefined;
  readonly supportedChains = ['stellar:public', 'stellar:testnet'] as any;

  private _account: WalletAccount | null = null;
  private _listeners = new Map<WalletEvent, Set<WalletEventCallback>>();
  private _connectShouldFail = false;
  private _disconnectShouldFail = false;

  set connectShouldFail(value: boolean) {
    this._connectShouldFail = value;
  }

  set disconnectShouldFail(value: boolean) {
    this._disconnectShouldFail = value;
  }

  async connect(_chainId?: string): Promise<WalletAccount> {
    if (this._connectShouldFail) {
      throw new Error('User rejected connection');
    }
    this._account = {
      address: 'GABCDEF1234567890',
      publicKey: 'GABCDEF1234567890',
      chainId: 'stellar:public',
      network: 'stellar',
    };
    this.emit('connect', this._account);
    return this._account;
  }

  async disconnect(): Promise<void> {
    if (this._disconnectShouldFail) {
      throw new Error('Failed to disconnect');
    }
    this._account = null;
    this.emit('disconnect', null);
  }

  async getAccount(): Promise<WalletAccount | null> {
    return this._account;
  }

  async getBalance(): Promise<any> {
    return {};
  }

  async getAllBalances(): Promise<any[]> {
    return [];
  }

  async switchNetwork(): Promise<void> {}

  async sign(): Promise<string> {
    return 'signed';
  }

  async sendTransaction(): Promise<string> {
    return 'txhash';
  }

  on(event: WalletEvent, callback: WalletEventCallback): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(callback);
  }

  off(event: WalletEvent, callback: WalletEventCallback): void {
    this._listeners.get(event)?.delete(callback);
  }

  /** Simulate an external event from the wallet extension. */
  simulateEvent(event: WalletEvent, data: unknown): void {
    this._listeners.get(event)?.forEach((cb) => cb(data));
  }

  simulateAccountChange(account: WalletAccount | null): void {
    this.simulateEvent('accountsChanged', account);
  }

  simulateExternalDisconnect(): void {
    this.simulateEvent('disconnect', null);
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('StellarWalletConnectionStateManager', () => {
  let manager: StellarWalletConnectionStateManager;

  beforeEach(() => {
    manager = new StellarWalletConnectionStateManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  // ─── Initial State ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with disconnected status', () => {
      expect(manager.getStatus()).toBe('disconnected');
    });

    it('has no account', () => {
      expect(manager.getAccount()).toBeNull();
    });

    it('is not connected', () => {
      expect(manager.isConnected()).toBe(false);
    });

    it('is not busy', () => {
      expect(manager.isBusy()).toBe(false);
    });

    it('has null adapterId', () => {
      expect(manager.getState().adapterId).toBeNull();
    });

    it('has no error', () => {
      expect(manager.getState().error).toBeNull();
    });
  });

  // ─── Connection Lifecycle ─────────────────────────────────────────────────

  describe('connect', () => {
    it('transitions from disconnected → connecting → connected', async () => {
      const adapter = new MockStellarAdapter();
      const statuses: string[] = [];

      manager.onStatusChange((status) => statuses.push(status));

      const account = await manager.connect(adapter);

      expect(account.address).toBe('GABCDEF1234567890');
      expect(manager.getStatus()).toBe('connected');
      expect(manager.isConnected()).toBe(true);
      expect(manager.getAccount()?.address).toBe('GABCDEF1234567890');
      expect(manager.getState().adapterId).toBe('mock-freighter');
      expect(manager.getState().connectedAt).toBeGreaterThan(0);

      // Status transitions: connecting, connected
      expect(statuses).toContain('connecting');
      expect(statuses).toContain('connected');
    });

    it('emits statusChanged event', async () => {
      const adapter = new MockStellarAdapter();
      const events: any[] = [];

      manager.subscribe((event) => events.push(event));

      await manager.connect(adapter);

      const statusEvents = events.filter((e) => e.type === 'statusChanged');
      expect(statusEvents).toHaveLength(2);
      expect(statusEvents[0]).toEqual(
        expect.objectContaining({
          type: 'statusChanged',
          previous: 'disconnected',
          current: 'connecting',
        }),
      );
      expect(statusEvents[1]).toEqual(
        expect.objectContaining({
          type: 'statusChanged',
          previous: 'connecting',
          current: 'connected',
        }),
      );
    });

    it('emits accountChanged event on connection', async () => {
      const adapter = new MockStellarAdapter();
      const events: any[] = [];

      manager.subscribe((event) => events.push(event));

      await manager.connect(adapter);

      const accountEvents = events.filter((e) => e.type === 'accountChanged');
      expect(accountEvents).toHaveLength(1);
      expect(accountEvents[0].current.address).toBe('GABCDEF1234567890');
      expect(accountEvents[0].previous).toBeNull();
    });

    it('returns cached account when already connected to the same adapter', async () => {
      const adapter = new MockStellarAdapter();

      const first = await manager.connect(adapter);
      const second = await manager.connect(adapter);

      expect(second.address).toBe(first.address);
      expect(manager.isConnected()).toBe(true);
    });

    it('handles connection failure', async () => {
      const adapter = new MockStellarAdapter();
      adapter.connectShouldFail = true;

      await expect(manager.connect(adapter)).rejects.toThrow('User rejected connection');

      expect(manager.getStatus()).toBe('error');
      expect(manager.getAccount()).toBeNull();
      expect(manager.getState().error).toBe('User rejected connection');
    });

    it('emits error event on connection failure', async () => {
      const adapter = new MockStellarAdapter();
      adapter.connectShouldFail = true;
      const events: any[] = [];

      manager.subscribe((event) => events.push(event));

      await expect(manager.connect(adapter)).rejects.toThrow();

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].error).toBe('User rejected connection');
    });
  });

  // ─── Disconnection ────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('transitions from connected → disconnecting → disconnected', async () => {
      const adapter = new MockStellarAdapter();
      const statuses: string[] = [];

      await manager.connect(adapter);
      manager.onStatusChange((status) => statuses.push(status));

      await manager.disconnect();

      expect(manager.getStatus()).toBe('disconnected');
      expect(manager.getAccount()).toBeNull();
      expect(manager.isConnected()).toBe(false);
      expect(manager.getState().adapterId).toBeNull();

      expect(statuses).toContain('disconnecting');
      expect(statuses).toContain('disconnected');
    });

    it('emits accountDisconnected event', async () => {
      const adapter = new MockStellarAdapter();
      const events: any[] = [];

      await manager.connect(adapter);
      manager.subscribe((event) => events.push(event));

      await manager.disconnect();

      const disconnectEvents = events.filter((e) => e.type === 'accountDisconnected');
      expect(disconnectEvents).toHaveLength(1);
      expect(disconnectEvents[0].previous.address).toBe('GABCDEF1234567890');
    });

    it('is a no-op when already disconnected', async () => {
      const events: any[] = [];
      manager.subscribe((event) => events.push(event));

      await manager.disconnect();

      expect(manager.getStatus()).toBe('disconnected');
      expect(events).toHaveLength(0);
    });

    it('resets state even if adapter disconnect throws', async () => {
      const adapter = new MockStellarAdapter();
      adapter.disconnectShouldFail = true;

      await manager.connect(adapter);
      await manager.disconnect();

      expect(manager.getStatus()).toBe('disconnected');
      expect(manager.getAccount()).toBeNull();
    });
  });

  // ─── Disconnection Detection ──────────────────────────────────────────────

  describe('disconnection detection', () => {
    it('detects external wallet disconnect via adapter event', async () => {
      const adapter = new MockStellarAdapter();
      const events: any[] = [];

      await manager.connect(adapter);
      manager.subscribe((event) => events.push(event));

      adapter.simulateExternalDisconnect();

      expect(manager.getStatus()).toBe('disconnected');
      expect(manager.getAccount()).toBeNull();

      const statusEvents = events.filter((e) => e.type === 'statusChanged');
      expect(statusEvents.some((e) => e.current === 'disconnected')).toBe(true);
    });

    it('detects account change to null as disconnection', async () => {
      const adapter = new MockStellarAdapter();
      const events: any[] = [];

      await manager.connect(adapter);
      manager.subscribe((event) => events.push(event));

      adapter.simulateAccountChange(null);

      expect(manager.getStatus()).toBe('disconnected');
      expect(manager.getAccount()).toBeNull();

      const disconnectEvents = events.filter((e) => e.type === 'accountDisconnected');
      expect(disconnectEvents).toHaveLength(1);
    });
  });

  // ─── Account Changes ──────────────────────────────────────────────────────

  describe('account changes', () => {
    it('detects account change via adapter event', async () => {
      const adapter = new MockStellarAdapter();
      const events: any[] = [];

      await manager.connect(adapter);
      manager.subscribe((event) => events.push(event));

      const newAccount: WalletAccount = {
        address: 'GNEWADDRESS12345',
        publicKey: 'GNEWADDRESS12345',
        chainId: 'stellar:testnet',
        network: 'stellar',
      };

      adapter.simulateAccountChange(newAccount);

      expect(manager.getAccount()?.address).toBe('GNEWADDRESS12345');

      const accountEvents = events.filter((e) => e.type === 'accountChanged');
      expect(accountEvents).toHaveLength(1);
      expect(accountEvents[0].current.address).toBe('GNEWADDRESS12345');
      expect(accountEvents[0].previous.address).toBe('GABCDEF1234567890');
    });

    it('does not emit accountChanged for same address', async () => {
      const adapter = new MockStellarAdapter();
      const events: any[] = [];

      await manager.connect(adapter);
      manager.subscribe((event) => events.push(event));

      const sameAccount: WalletAccount = {
        address: 'GABCDEF1234567890',
        publicKey: 'GABCDEF1234567890',
        chainId: 'stellar:public',
        network: 'stellar',
      };

      adapter.simulateAccountChange(sameAccount);

      const accountEvents = events.filter((e) => e.type === 'accountChanged');
      expect(accountEvents).toHaveLength(0);
    });
  });

  // ─── Event Subscriptions ──────────────────────────────────────────────────

  describe('event subscriptions', () => {
    it('unsubscribe stops receiving events', async () => {
      const adapter = new MockStellarAdapter();
      const events: any[] = [];

      const unsubscribe = manager.subscribe((event) => events.push(event));

      await manager.connect(adapter);
      expect(events.length).toBeGreaterThan(0);

      unsubscribe();
      events.length = 0;

      await manager.disconnect();
      expect(events).toHaveLength(0);
    });

    it('onStatusChange callback receives status transitions', async () => {
      const adapter = new MockStellarAdapter();
      const transitions: Array<{ current: string; previous: string }> = [];

      manager.onStatusChange((current, previous) =>
        transitions.push({ current, previous }),
      );

      await manager.connect(adapter);
      await manager.disconnect();

      expect(transitions).toEqual([
        { previous: 'disconnected', current: 'connecting' },
        { previous: 'connecting', current: 'connected' },
        { previous: 'connected', current: 'disconnecting' },
        { previous: 'disconnecting', current: 'disconnected' },
      ]);
    });

    it('onAccountChange callback fires on new connections', async () => {
      const adapter = new MockStellarAdapter();
      const changes: Array<{ current: WalletAccount | null; previous: WalletAccount | null }> = [];

      manager.onAccountChange((current, previous) =>
        changes.push({ current, previous }),
      );

      await manager.connect(adapter);

      expect(changes).toHaveLength(1);
      expect(changes[0].current?.address).toBe('GABCDEF1234567890');
      expect(changes[0].previous).toBeNull();
    });

    it('onDisconnect callback fires on disconnection', async () => {
      const adapter = new MockStellarAdapter();
      const disconnectedAccounts: WalletAccount[] = [];

      manager.onDisconnect((account) => disconnectedAccounts.push(account));

      await manager.connect(adapter);
      await manager.disconnect();

      expect(disconnectedAccounts).toHaveLength(1);
      expect(disconnectedAccounts[0].address).toBe('GABCDEF1234567890');
    });

    it('onError callback fires on errors', async () => {
      const adapter = new MockStellarAdapter();
      adapter.connectShouldFail = true;

      const errors: string[] = [];
      manager.onError((error) => errors.push(error));

      await expect(manager.connect(adapter)).rejects.toThrow();

      expect(errors).toContain('User rejected connection');
    });

    it('tolerates listener errors without breaking other listeners', async () => {
      const adapter = new MockStellarAdapter();
      const results: number[] = [];

      manager.subscribe(() => {
        throw new Error('listener error');
      });
      manager.subscribe(() => results.push(1));
      manager.subscribe(() => results.push(2));

      await manager.connect(adapter);

      expect(results).toContain(1);
      expect(results).toContain(2);
    });
  });

  // ─── Reconcile ────────────────────────────────────────────────────────────

  describe('reconcile', () => {
    it('sets state from an adapter with an active account', async () => {
      const adapter = new MockStellarAdapter();
      await adapter.connect();

      await manager.reconcile(adapter);

      expect(manager.getStatus()).toBe('connected');
      expect(manager.getAccount()?.address).toBe('GABCDEF1234567890');
    });

    it('remains disconnected for an adapter with no account', async () => {
      const adapter = new MockStellarAdapter();

      await manager.reconcile(adapter);

      expect(manager.getStatus()).toBe('disconnected');
      expect(manager.getAccount()).toBeNull();
    });

    it('handles reconcile failure gracefully', async () => {
      const adapter = new MockStellarAdapter();
      (adapter as any).getAccount = jest.fn().mockRejectedValue(new Error('network error'));

      await manager.reconcile(adapter);

      expect(manager.getStatus()).toBe('disconnected');
    });
  });

  // ─── Destroy ──────────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('resets all state and removes listeners', async () => {
      const adapter = new MockStellarAdapter();
      const events: any[] = [];

      await manager.connect(adapter);
      manager.subscribe((event) => events.push(event));

      manager.destroy();

      expect(manager.getStatus()).toBe('disconnected');
      expect(manager.getAccount()).toBeNull();
      expect(manager.isConnected()).toBe(false);

      // Events after destroy should not be received
      events.length = 0;
      adapter.simulateExternalDisconnect();
      expect(events).toHaveLength(0);
    });
  });

  // ─── Singleton Factory ────────────────────────────────────────────────────

  describe('singleton factory', () => {
    afterEach(() => {
      resetStellarWalletConnectionState();
    });

    it('returns the same instance', () => {
      const a = getStellarWalletConnectionState();
      const b = getStellarWalletConnectionState();
      expect(a).toBe(b);
    });

    it('reset creates a fresh instance', () => {
      const a = getStellarWalletConnectionState();
      resetStellarWalletConnectionState();
      const b = getStellarWalletConnectionState();
      expect(a).not.toBe(b);
    });
  });
});
