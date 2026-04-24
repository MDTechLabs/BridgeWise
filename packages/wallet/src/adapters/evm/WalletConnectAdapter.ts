/**
 * WalletConnect Adapter
 * Connects to wallets via WalletConnect v2 protocol
 */

import { EVMBaseAdapter } from './EVMBaseAdapter';
import type { EVMAdapterOptions } from './EVMBaseAdapter';
import type { EVMProvider, WalletAccount, ChainId } from '../../types';
import { EVM_CHAINS, numericToEvmChainId } from '../../types';

export interface WalletConnectAdapterOptions extends EVMAdapterOptions {
  /** WalletConnect project ID (required) */
  projectId: string;
  /** Wallet name to display */
  walletName?: string;
  /** Custom WalletConnect provider instance */
  wcProvider?: EVMProvider;
}

/**
 * WalletConnect v2 adapter
 * Connects to mobile and desktop wallets via the WalletConnect protocol
 *
 * @example
 * ```ts
 * const adapter = new WalletConnectAdapter({
 *   projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
 * });
 * const account = await adapter.connect();
 * ```
 */
export class WalletConnectAdapter extends EVMBaseAdapter {
  readonly id = 'walletconnect';
  readonly name: string;
  readonly type = 'walletconnect' as const;
  readonly icon = 'https://avatars.githubusercontent.com/u/37784886';

  private wcOptions: WalletConnectAdapterOptions;
  private externalProvider: EVMProvider | null = null;

  constructor(options: WalletConnectAdapterOptions) {
    super(options);
    this.wcOptions = options;
    this.name = options.walletName || 'WalletConnect';

    if (options.wcProvider) {
      this.externalProvider = options.wcProvider;
    }
  }

  /**
   * Check if WalletConnect is available
   * WalletConnect is always available as it doesn't require a browser extension
   */
  get isAvailable(): boolean {
    return !!this.externalProvider || typeof (globalThis as any).window !== 'undefined';
  }

  /**
   * Set an external WalletConnect provider
   * Use this when integrating with @walletconnect/ethereum-provider
   */
  setProvider(provider: EVMProvider): void {
    this.externalProvider = provider;
  }

  /**
   * Get the WalletConnect EVM provider
   */
  protected getProvider(): EVMProvider | null {
    if (this.externalProvider) {
      return this.externalProvider;
    }

    // Try to get from global (when @walletconnect/web3-provider is loaded)
    if (typeof (globalThis as any).window !== 'undefined') {
      const w = (globalThis as any).window as any;
      if (w.walletconnect?.ethereum) {
        return w.walletconnect.ethereum as EVMProvider;
      }
    }

    return null;
  }

  /**
   * Connect via WalletConnect
   * Creates a new session or restores an existing one
   */
  async connect(chainId?: ChainId): Promise<WalletAccount> {
    const provider = this.getProvider();

    if (!provider) {
      throw this.createError(
        'WALLET_NOT_FOUND',
        'WalletConnect provider not initialized. Call setProvider() first or pass wcProvider in options.'
      );
    }

    this.provider = provider;

    try {
      // Request accounts via WalletConnect
      const accounts = await provider.request({
        method: 'eth_requestAccounts',
      }) as string[];

      if (!accounts || accounts.length === 0) {
        throw this.createError('CONNECTION_FAILED', 'No accounts returned from WalletConnect');
      }

      this.currentAccount = accounts[0];

      // Get chain ID
      const chainIdHex = await provider.request({
        method: 'eth_chainId',
      }) as string;

      const numericChainId = parseInt(chainIdHex, 16);
      this.currentChainId = numericToEvmChainId(numericChainId);

      // Switch chain if requested
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
        throw this.createError('USER_REJECTED', 'User rejected the WalletConnect session');
      }
      throw this.createError('CONNECTION_FAILED', 'Failed to connect via WalletConnect', error);
    }
  }

  /**
   * Disconnect WalletConnect session
   */
  async disconnect(): Promise<void> {
    if (this.provider) {
      try {
        // Close the WalletConnect session
        await this.provider.request({
          method: 'wallet_disconnect',
        }).catch(() => {});
      } catch {
        // Ignore disconnect errors
      }
    }

    this.currentAccount = null;
    this.currentChainId = null;
    this.provider = null;
    this.emit('disconnect', null);
  }
}
