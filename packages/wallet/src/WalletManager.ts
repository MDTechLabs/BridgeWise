/**
 * Wallet Manager
 * Central registry and orchestrator for wallet adapters
 * Manages wallet discovery, connection, and multi-wallet state
 */

import type {
  WalletAdapter,
  WalletAccount,
  WalletConnection,
  MultiWalletState,
  WalletError,
  WalletEvent,
  WalletEventCallback,
  ChainId,
  NetworkType,
  TokenBalance,
  WalletTransaction,
  WalletType,
} from './types';

/**
 * Wallet manager configuration
 */
export interface WalletManagerOptions {
  /** Wallet adapters to register */
  adapters?: WalletAdapter[];
  /** Auto-discover available wallets */
  autoDiscover?: boolean;
  /** Maximum number of concurrent wallets */
  maxWallets?: number;
  /** Callback when any wallet connects */
  onConnect?: (account: WalletAccount, walletId: string) => void;
  /** Callback when any wallet disconnects */
  onDisconnect?: (walletId: string) => void;
  /** Callback on error */
  onError?: (error: WalletError, walletId?: string) => void;
  /** Callback when account changes */
  onAccountChange?: (account: WalletAccount | null, walletId: string) => void;
  /** Callback when network changes */
  onNetworkChange?: (chainId: ChainId, network: NetworkType, walletId: string) => void;
}

/**
 * Wallet Manager
 * Centralized wallet connection management for BridgeWise
 *
 * @example
 * ```ts
 * const manager = new WalletManager({
 *   adapters: [new MetaMaskAdapter(), new FreighterAdapter()],
 *   autoDiscover: true,
 * });
 *
 * // Discover available wallets
 * const available = manager.getAvailableWallets();
 *
 * // Connect to a specific wallet
 * const account = await manager.connect('metamask');
 *
 * // Get active account
 * const active = manager.getActiveAccount();
 * ```
 */
export class WalletManager {
  private adapters: Map<string, WalletAdapter> = new Map();
  private connections: Map<string, WalletConnection> = new Map();
  private activeWalletId: string | null = null;
  private eventListeners: Map<WalletEvent, Set<WalletEventCallback>> = new Map();
  private options: WalletManagerOptions;

  constructor(options: WalletManagerOptions = {}) {
    this.options = options;

    // Register initial adapters
    if (options.adapters) {
      for (const adapter of options.adapters) {
        this.registerAdapter(adapter);
      }
    }
  }

  // ─── Adapter Registration ──────────────────────────────────────────────────

  /**
   * Register a wallet adapter
   */
  registerAdapter(adapter: WalletAdapter): void {
    this.adapters.set(adapter.id, adapter);

    // Forward adapter events to manager events
    adapter.on('connect', (data) => {
      this.handleAdapterConnect(adapter.id, data as WalletAccount);
    });

    adapter.on('disconnect', () => {
      this.handleAdapterDisconnect(adapter.id);
    });

    adapter.on('accountsChanged', (data) => {
      this.handleAccountChange(adapter.id, data as WalletAccount | null);
    });

    adapter.on('chainChanged', (data) => {
      const chainData = data as { chainId: ChainId };
      this.emit('chainChanged', { walletId: adapter.id, ...chainData });
    });

    adapter.on('error', (data) => {
      this.options.onError?.(data as WalletError, adapter.id);
    });
  }

  /**
   * Unregister a wallet adapter
   */
  unregisterAdapter(adapterId: string): void {
    this.adapters.delete(adapterId);
    this.connections.delete(adapterId);

    if (this.activeWalletId === adapterId) {
      this.activeWalletId = null;
    }
  }

  // ─── Wallet Discovery ──────────────────────────────────────────────────────

  /**
   * Get all registered adapters
   */
  getAllAdapters(): WalletAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get only available (installed) wallet adapters
   */
  getAvailableWallets(): WalletAdapter[] {
    return Array.from(this.adapters.values()).filter((a) => a.isAvailable);
  }

  /**
   * Get adapters by network type
   */
  getAdaptersByNetwork(networkType: NetworkType): WalletAdapter[] {
    return Array.from(this.adapters.values()).filter(
      (a) => a.networkType === networkType
    );
  }

  /**
   * Get EVM wallet adapters
   */
  getEVMWallets(): WalletAdapter[] {
    return this.getAdaptersByNetwork('evm');
  }

  /**
   * Get Stellar wallet adapters
   */
  getStellarWallets(): WalletAdapter[] {
    return this.getAdaptersByNetwork('stellar');
  }

  /**
   * Get a specific adapter by ID
   */
  getAdapter(adapterId: string): WalletAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  // ─── Connection Management ─────────────────────────────────────────────────

  /**
   * Connect to a wallet by adapter ID
   */
  async connect(adapterId: string, chainId?: ChainId): Promise<WalletAccount> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw this.createError('WALLET_NOT_FOUND', `Wallet adapter '${adapterId}' not found`);
    }

    if (!adapter.isAvailable) {
      throw this.createError('WALLET_NOT_FOUND', `Wallet '${adapter.name}' is not available`);
    }

    const maxWallets = this.options.maxWallets || Infinity;
    if (this.connections.size >= maxWallets && !this.connections.has(adapterId)) {
      throw this.createError('CONNECTION_FAILED', `Maximum number of wallets (${maxWallets}) reached`);
    }

    const account = await adapter.connect(chainId);

    // Update connection state
    const existingConnection = this.connections.get(adapterId);
    if (existingConnection) {
      existingConnection.accounts = [account];
      existingConnection.connected = true;
    } else {
      this.connections.set(adapterId, {
        walletType: adapter.type,
        wallet: adapter,
        accounts: [account],
        connected: true,
        activeAccountIndex: 0,
      });
    }

    // Set as active wallet
    this.activeWalletId = adapterId;

    this.emit('connect', { walletId: adapterId, account });
    this.options.onConnect?.(account, adapterId);

    return account;
  }

  /**
   * Disconnect a wallet by adapter ID
   */
  async disconnect(adapterId: string): Promise<void> {
    const adapter = this.adapters.get(adapterId);
    const connection = this.connections.get(adapterId);

    if (!adapter || !connection) {
      return;
    }

    await adapter.disconnect();

    this.connections.delete(adapterId);

    // If this was the active wallet, switch to another
    if (this.activeWalletId === adapterId) {
      const remaining = Array.from(this.connections.keys());
      this.activeWalletId = remaining.length > 0 ? remaining[0] : null;
    }

    this.emit('disconnect', { walletId: adapterId });
    this.options.onDisconnect?.(adapterId);
  }

  /**
   * Disconnect all wallets
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.keys()).map((id) =>
      this.disconnect(id)
    );
    await Promise.all(disconnectPromises);
  }

  // ─── Active Account ────────────────────────────────────────────────────────

  /**
   * Get the active (currently selected) account
   */
  getActiveAccount(): WalletAccount | null {
    if (!this.activeWalletId) return null;

    const connection = this.connections.get(this.activeWalletId);
    if (!connection || !connection.connected) return null;

    return connection.accounts[connection.activeAccountIndex] || null;
  }

  /**
   * Get the active wallet adapter
   */
  getActiveWallet(): WalletAdapter | null {
    if (!this.activeWalletId) return null;
    return this.adapters.get(this.activeWalletId) || null;
  }

  /**
   * Set the active wallet by adapter ID
   */
  setActiveWallet(adapterId: string): void {
    if (!this.connections.has(adapterId)) {
      throw this.createError('NOT_CONNECTED', `Wallet '${adapterId}' is not connected`);
    }
    this.activeWalletId = adapterId;
  }

  /**
   * Switch the active account within a multi-account wallet
   */
  switchAccount(adapterId: string, accountIndex: number): void {
    const connection = this.connections.get(adapterId);
    if (!connection) {
      throw this.createError('NOT_CONNECTED', `Wallet '${adapterId}' is not connected`);
    }
    if (accountIndex < 0 || accountIndex >= connection.accounts.length) {
      throw this.createError('ACCOUNT_NOT_FOUND', `Account index ${accountIndex} out of range`);
    }
    connection.activeAccountIndex = accountIndex;
  }

  // ─── Multi-Wallet State ────────────────────────────────────────────────────

  /**
   * Get the full multi-wallet state
   */
  getState(): MultiWalletState {
    const wallets = Array.from(this.connections.values());
    const activeIndex = this.activeWalletId
      ? wallets.findIndex((w) => w.wallet.id === this.activeWalletId)
      : null;

    const activeConnection = this.activeWalletId
      ? this.connections.get(this.activeWalletId)
      : null;

    return {
      wallets,
      activeWalletIndex: activeIndex,
      activeAccount: activeConnection
        ? activeConnection.accounts[activeConnection.activeAccountIndex]
        : null,
      error: null,
      isRestoring: false,
    };
  }

  /**
   * Get all connected accounts across all wallets
   */
  getAllAccounts(): WalletAccount[] {
    const accounts: WalletAccount[] = [];
    for (const connection of this.connections.values()) {
      accounts.push(...connection.accounts);
    }
    return accounts;
  }

  // ─── Balance Queries ───────────────────────────────────────────────────────

  /**
   * Get balances for the active wallet
   */
  async getBalances(): Promise<TokenBalance[]> {
    const wallet = this.getActiveWallet();
    if (!wallet) {
      throw this.createError('NOT_CONNECTED', 'No active wallet');
    }
    return wallet.getAllBalances();
  }

  /**
   * Get balance for a specific token on the active wallet
   */
  async getBalance(token: string): Promise<TokenBalance> {
    const wallet = this.getActiveWallet();
    if (!wallet) {
      throw this.createError('NOT_CONNECTED', 'No active wallet');
    }
    return wallet.getBalance(token);
  }

  /**
   * Refresh balances for all connected wallets
   */
  async refreshAllBalances(): Promise<Map<string, TokenBalance[]>> {
    const results = new Map<string, TokenBalance[]>();

    const promises = Array.from(this.connections.entries()).map(
      async ([id, connection]) => {
        try {
          const balances = await connection.wallet.getAllBalances();
          results.set(id, balances);
        } catch (error) {
          results.set(id, []);
        }
      }
    );

    await Promise.all(promises);
    return results;
  }

  // ─── Network Switching ─────────────────────────────────────────────────────

  /**
   * Switch network on the active wallet
   */
  async switchNetwork(chainId: ChainId): Promise<void> {
    const wallet = this.getActiveWallet();
    if (!wallet) {
      throw this.createError('NOT_CONNECTED', 'No active wallet');
    }

    await wallet.switchNetwork(chainId);

    // Update the account's chain ID
    const connection = this.connections.get(wallet.id);
    if (connection && connection.accounts.length > 0) {
      connection.accounts[connection.activeAccountIndex] = {
        ...connection.accounts[connection.activeAccountIndex],
        chainId,
      };
    }
  }

  // ─── Signing & Transactions ────────────────────────────────────────────────

  /**
   * Sign data with the active wallet
   */
  async sign(data: string | object): Promise<string> {
    const wallet = this.getActiveWallet();
    if (!wallet) {
      throw this.createError('NOT_CONNECTED', 'No active wallet');
    }
    return wallet.sign(data);
  }

  /**
   * Send a transaction from the active wallet
   */
  async sendTransaction(transaction: WalletTransaction): Promise<string> {
    const wallet = this.getActiveWallet();
    if (!wallet) {
      throw this.createError('NOT_CONNECTED', 'No active wallet');
    }

    // Auto-fill from address
    const account = this.getActiveAccount();
    if (!transaction.from && account) {
      transaction = { ...transaction, from: account.address };
    }

    return wallet.sendTransaction(transaction);
  }

  // ─── Event Handling ────────────────────────────────────────────────────────

  on(event: WalletEvent, callback: WalletEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: WalletEvent, callback: WalletEventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  private emit(event: WalletEvent, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  // ─── Internal Event Handlers ───────────────────────────────────────────────

  private handleAdapterConnect(adapterId: string, account: WalletAccount): void {
    const connection = this.connections.get(adapterId);
    if (connection) {
      connection.accounts = [account];
      connection.connected = true;
    }
  }

  private handleAdapterDisconnect(adapterId: string): void {
    this.connections.delete(adapterId);
    if (this.activeWalletId === adapterId) {
      const remaining = Array.from(this.connections.keys());
      this.activeWalletId = remaining.length > 0 ? remaining[0] : null;
    }
  }

  private handleAccountChange(adapterId: string, account: WalletAccount | null): void {
    const connection = this.connections.get(adapterId);
    if (connection) {
      if (account) {
        connection.accounts[connection.activeAccountIndex] = account;
      }
    }
    this.options.onAccountChange?.(account, adapterId);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private createError(code: WalletError['code'], message: string): WalletError {
    return { code, message };
  }
}
