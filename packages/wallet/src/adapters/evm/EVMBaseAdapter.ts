/**
 * EVM Base Adapter
 * Abstract base class for EVM wallet adapters (MetaMask, WalletConnect, etc.)
 * Provides shared EVM logic: chain switching, balance fetching, transaction sending
 */

import type {
  WalletAdapter,
  WalletAccount,
  TokenBalance,
  WalletError,
  WalletEvent,
  WalletEventCallback,
  WalletTransaction,
  EVMProvider,
  ChainId,
} from '../../types';

import {
  EVM_CHAINS,
  numericToEvmChainId,
  evmChainIdToNumeric,
  getNetworkType,
} from '../../types';

/**
 * EVM adapter configuration options
 */
export interface EVMAdapterOptions {
  /** Supported chains (defaults to common EVM chains) */
  supportedChains?: ChainId[];
  /** RPC URLs for each chain (for balance queries) */
  rpcUrls?: Record<ChainId, string>;
  /** Default chain to connect to */
  defaultChainId?: ChainId;
}

/**
 * Abstract EVM wallet adapter base class
 * Handles shared EVM functionality including EIP-1193 provider interactions
 */
export abstract class EVMBaseAdapter implements WalletAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly type: WalletAdapter['type'];
  readonly networkType = 'evm' as const;
  abstract readonly icon?: string;

  protected provider: EVMProvider | null = null;
  protected currentAccount: string | null = null;
  protected currentChainId: ChainId | null = null;
  protected eventListeners: Map<WalletEvent, Set<WalletEventCallback>> = new Map();
  protected options: EVMAdapterOptions;

  /** All supported EVM chains */
  readonly supportedChains: ChainId[];

  constructor(options: EVMAdapterOptions = {}) {
    this.options = options;
    this.supportedChains = options.supportedChains || Object.values(EVM_CHAINS);
  }

  /**
   * Check if an EVM provider (window.ethereum) is available
   */
  abstract get isAvailable(): boolean;

  /**
   * Initialize the EVM provider (to be implemented by subclasses)
   */
  protected abstract getProvider(): EVMProvider | null;

  // ─── Connection ────────────────────────────────────────────────────────────

  async connect(chainId?: ChainId): Promise<WalletAccount> {
    const provider = this.getProvider();

    if (!provider) {
      throw this.createError('WALLET_NOT_FOUND', `${this.name} not found. Please install the wallet extension.`);
    }

    this.provider = provider;

    try {
      // Request accounts (EIP-1102 / eth_requestAccounts)
      const accounts = await provider.request({
        method: 'eth_requestAccounts',
      }) as string[];

      if (!accounts || accounts.length === 0) {
        throw this.createError('CONNECTION_FAILED', 'No accounts returned from wallet');
      }

      this.currentAccount = accounts[0];

      // Get current chain ID
      const chainIdHex = await provider.request({
        method: 'eth_chainId',
      }) as string;

      const numericChainId = parseInt(chainIdHex, 16);
      this.currentChainId = numericToEvmChainId(numericChainId);

      // Switch chain if requested and different
      if (chainId && chainId !== this.currentChainId) {
        await this.switchNetwork(chainId);
      }

      const account: WalletAccount = {
        address: this.currentAccount,
        chainId: this.currentChainId || this.options.defaultChainId || EVM_CHAINS.ETHEREUM,
        network: 'evm',
      };

      this.setupEventListeners();
      this.emit('connect', account);

      return account;
    } catch (error) {
      if (this.isUserRejectedError(error)) {
        throw this.createError('USER_REJECTED', 'User rejected the connection request');
      }
      throw this.createError('CONNECTION_FAILED', 'Failed to connect to wallet', error);
    }
  }

  async disconnect(): Promise<void> {
    this.currentAccount = null;
    this.currentChainId = null;
    this.provider = null;
    this.emit('disconnect', null);
  }

  async getAccount(): Promise<WalletAccount | null> {
    if (!this.currentAccount || !this.currentChainId) {
      return null;
    }

    return {
      address: this.currentAccount,
      chainId: this.currentChainId,
      network: 'evm',
    };
  }

  // ─── Balance ───────────────────────────────────────────────────────────────

  async getBalance(token: string): Promise<TokenBalance> {
    if (!this.currentAccount || !this.provider) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    try {
      if (token.toLowerCase() === 'native' || token === '0x0') {
        // Native ETH balance
        const balanceHex = await this.provider.request({
          method: 'eth_getBalance',
          params: [this.currentAccount, 'latest'],
        }) as string;

        const balanceWei = BigInt(balanceHex);
        const balanceEth = Number(balanceWei) / 1e18;

        return {
          token: 'native',
          symbol: 'ETH',
          decimals: 18,
          balance: balanceWei.toString(),
          balanceFormatted: `${balanceEth.toFixed(6)} ETH`,
        };
      }

      // ERC-20 token balance
      return this.getERC20Balance(token);
    } catch (error) {
      throw this.createError('BALANCE_FETCH_FAILED', `Failed to fetch balance for ${token}`, error);
    }
  }

  async getAllBalances(): Promise<TokenBalance[]> {
    // Return native balance by default
    // Subclasses can override to add ERC-20 tokens
    const nativeBalance = await this.getBalance('native');
    return [nativeBalance];
  }

  /**
   * Get ERC-20 token balance using eth_call
   */
  protected async getERC20Balance(tokenAddress: string): Promise<TokenBalance> {
    if (!this.currentAccount || !this.provider) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    // ERC-20 balanceOf(address) selector = 0x70a08231
    const paddedAddress = this.currentAccount.toLowerCase().replace('0x', '').padStart(64, '0');
    const calldata = `0x70a08231${paddedAddress}`;

    const result = await this.provider.request({
      method: 'eth_call',
      params: [{ to: tokenAddress, data: calldata }, 'latest'],
    }) as string;

    const balance = BigInt(result || '0');

    // Get symbol and decimals (simplified)
    return {
      token: tokenAddress,
      symbol: 'ERC20',
      decimals: 18,
      balance: balance.toString(),
      balanceFormatted: `${(Number(balance) / 1e18).toFixed(6)} ERC20`,
    };
  }

  // ─── Network Switching ─────────────────────────────────────────────────────

  async switchNetwork(chainId: ChainId): Promise<void> {
    if (!this.provider) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    if (getNetworkType(chainId) !== 'evm') {
      throw this.createError('NETWORK_NOT_SUPPORTED', `Cannot switch to non-EVM chain: ${chainId}`);
    }

    const numericId = evmChainIdToNumeric(chainId);
    if (numericId === null) {
      throw this.createError('NETWORK_NOT_SUPPORTED', `Invalid EVM chain ID: ${chainId}`);
    }

    const chainIdHex = `0x${numericId.toString(16)}`;

    try {
      await this.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });

      this.currentChainId = chainId;
      this.emit('chainChanged', { chainId });
      this.emit('networkChanged', { chainId, network: 'evm' });
    } catch (error: any) {
      // Chain not added yet — try to add it
      if (error?.code === 4902) {
        await this.addEthereumChain(chainId, numericId);
        return;
      }

      if (this.isUserRejectedError(error)) {
        throw this.createError('USER_REJECTED', 'User rejected the network switch');
      }
      throw this.createError('NETWORK_SWITCH_REJECTED', `Failed to switch to chain ${chainId}`, error);
    }
  }

  /**
   * Add a new EVM chain (EIP-3085 wallet_addEthereumChain)
   */
  protected async addEthereumChain(chainId: ChainId, numericId: number): Promise<void> {
    if (!this.provider) return;

    const rpcUrl = this.options.rpcUrls?.[chainId] || 'https://rpc.ankr.com/eth';

    const chainParams = {
      chainId: `0x${numericId.toString(16)}`,
      chainName: `Chain ${numericId}`,
      nativeCurrency: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: [rpcUrl],
      blockExplorerUrls: ['https://etherscan.io'],
    };

    try {
      await this.provider.request({
        method: 'wallet_addEthereumChain',
        params: [chainParams],
      });

      this.currentChainId = chainId;
      this.emit('chainChanged', { chainId });
    } catch (error) {
      throw this.createError('NETWORK_SWITCH_REJECTED', `Failed to add chain ${chainId}`, error);
    }
  }

  // ─── Signing & Transactions ────────────────────────────────────────────────

  async sign(data: string | object): Promise<string> {
    if (!this.currentAccount || !this.provider) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      const signature = await this.provider.request({
        method: 'personal_sign',
        params: [message, this.currentAccount],
      }) as string;

      return signature;
    } catch (error) {
      if (this.isUserRejectedError(error)) {
        throw this.createError('USER_REJECTED', 'User rejected the signing request');
      }
      throw this.createError('SIGN_FAILED', 'Failed to sign data', error);
    }
  }

  async sendTransaction(transaction: WalletTransaction): Promise<string> {
    if (!this.currentAccount || !this.provider) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    try {
      const txParams: Record<string, unknown> = {
        from: this.currentAccount,
        to: transaction.to,
      };

      if (transaction.value) txParams.value = transaction.value;
      if (transaction.data) txParams.data = transaction.data;
      if (transaction.gasLimit) txParams.gas = transaction.gasLimit;
      if (transaction.gasPrice) txParams.gasPrice = transaction.gasPrice;

      // EIP-1559 fields
      if (transaction.maxFeePerGas) txParams.maxFeePerGas = transaction.maxFeePerGas;
      if (transaction.maxPriorityFeePerGas) txParams.maxPriorityFeePerGas = transaction.maxPriorityFeePerGas;

      const txHash = await this.provider.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      }) as string;

      return txHash;
    } catch (error) {
      if (this.isUserRejectedError(error)) {
        throw this.createError('USER_REJECTED', 'User rejected the transaction');
      }
      throw this.createError('TX_FAILED', 'Failed to send transaction', error);
    }
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

  /**
   * Emit an event to all registered listeners
   */
  protected emit(event: WalletEvent, data: unknown): void {
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

  /**
   * Setup EIP-1193 event listeners on the provider
   */
  protected setupEventListeners(): void {
    if (!this.provider) return;

    // Account changed
    this.provider.on('accountsChanged', (accounts: unknown) => {
      const accountList = accounts as string[];
      if (accountList.length === 0) {
        this.disconnect();
      } else {
        this.currentAccount = accountList[0];
        this.emit('accountsChanged', { address: this.currentAccount });
      }
    });

    // Chain changed
    this.provider.on('chainChanged', (chainIdHex: unknown) => {
      const hex = chainIdHex as string;
      const numericId = parseInt(hex, 16);
      this.currentChainId = numericToEvmChainId(numericId);
      this.emit('chainChanged', { chainId: this.currentChainId });
      this.emit('networkChanged', { chainId: this.currentChainId, network: 'evm' });
    });

    // Disconnect
    this.provider.on('disconnect', () => {
      this.currentAccount = null;
      this.currentChainId = null;
      this.emit('disconnect', null);
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Check if error indicates user rejection
   */
  protected isUserRejectedError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as { code?: number; message?: string };
      // MetaMask error codes: 4001 (user rejected), -32603 (internal)
      if (err.code === 4001) return true;
      if (err.message?.includes('user rejected') || err.message?.includes('User rejected')) return true;
    }
    return false;
  }

  /**
   * Create a wallet error
   */
  protected createError(code: WalletError['code'], message: string, originalError?: unknown): WalletError {
    return { code, message, originalError };
  }
}
