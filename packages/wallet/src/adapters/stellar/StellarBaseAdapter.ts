/**
 * Stellar Base Adapter
 * Abstract base class for Stellar wallet adapters (Freighter, Rabet, Albedo, xBull)
 * Provides shared Stellar logic: Horizon API queries, transaction signing, network switching
 */

import type {
  WalletAdapter,
  WalletAccount,
  TokenBalance,
  WalletError,
  WalletEvent,
  WalletEventCallback,
  WalletTransaction,
  StellarProvider,
  ChainId,
} from '../../types';

import {
  STELLAR_CHAINS,
  STELLAR_NETWORK_PASSPHRASES,
  STELLAR_HORIZON_URLS,
} from '../../types';

/**
 * Stellar adapter configuration options
 */
export interface StellarAdapterOptions {
  /** Preferred Stellar wallet provider */
  preferredProvider?: 'freighter' | 'rabet' | 'albedo' | 'xbull';
  /** Default network */
  defaultNetwork?: 'public' | 'testnet' | 'futurenet';
  /** Custom Horizon URL overrides */
  horizonUrls?: Record<string, string>;
}

/**
 * Abstract Stellar wallet adapter base class
 * Handles shared Stellar functionality including Horizon API interactions
 */
export abstract class StellarBaseAdapter implements WalletAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly type: WalletAdapter['type'];
  readonly networkType = 'stellar' as const;
  abstract readonly icon?: string;

  readonly supportedChains: ChainId[] = [
    STELLAR_CHAINS.PUBLIC,
    STELLAR_CHAINS.TESTNET,
    STELLAR_CHAINS.FUTURENET,
  ];

  protected provider: StellarProvider | null = null;
  protected currentAccount: string | null = null;
  protected currentNetwork: string;
  protected eventListeners: Map<WalletEvent, Set<WalletEventCallback>> = new Map();
  protected options: StellarAdapterOptions;

  constructor(options: StellarAdapterOptions = {}) {
    this.options = options;
    this.currentNetwork = options.defaultNetwork || 'public';
  }

  /**
   * Check if a Stellar wallet is available
   */
  abstract get isAvailable(): boolean;

  /**
   * Detect and return the Stellar provider (to be implemented by subclasses)
   */
  protected abstract getProvider(): StellarProvider | null;

  // ─── Connection ────────────────────────────────────────────────────────────

  async connect(chainId?: ChainId): Promise<WalletAccount> {
    const provider = this.getProvider();

    if (!provider) {
      throw this.createError(
        'WALLET_NOT_FOUND',
        'No Stellar wallet found. Please install a Stellar wallet extension.'
      );
    }

    this.provider = provider;

    try {
      const publicKey = await provider.publicKey();

      if (!publicKey) {
        throw this.createError('CONNECTION_FAILED', 'Failed to get public key from wallet');
      }

      this.currentAccount = publicKey;

      // Determine network
      const targetNetwork = chainId
        ? chainId.replace('stellar:', '')
        : this.currentNetwork;

      this.currentNetwork = targetNetwork;

      // Try to get actual network from wallet
      if ('getNetwork' in provider) {
        try {
          const walletNetwork = await provider.getNetwork();
          if (walletNetwork === STELLAR_NETWORK_PASSPHRASES[STELLAR_CHAINS.PUBLIC]) {
            this.currentNetwork = 'public';
          } else if (walletNetwork === STELLAR_NETWORK_PASSPHRASES[STELLAR_CHAINS.TESTNET]) {
            this.currentNetwork = 'testnet';
          } else if (walletNetwork === STELLAR_NETWORK_PASSPHRASES[STELLAR_CHAINS.FUTURENET]) {
            this.currentNetwork = 'futurenet';
          }
        } catch {
          // Fallback to default
        }
      }

      const account: WalletAccount = {
        address: this.currentAccount,
        publicKey: this.currentAccount,
        chainId: `stellar:${this.currentNetwork}`,
        network: 'stellar',
      };

      this.emit('connect', account);

      return account;
    } catch (error) {
      if (this.isUserRejectedError(error)) {
        throw this.createError('USER_REJECTED', 'User rejected the connection request');
      }
      throw this.createError('CONNECTION_FAILED', 'Failed to connect to Stellar wallet', error);
    }
  }

  async disconnect(): Promise<void> {
    this.currentAccount = null;
    this.provider = null;
    this.emit('disconnect', null);
  }

  async getAccount(): Promise<WalletAccount | null> {
    if (!this.currentAccount) {
      return null;
    }

    return {
      address: this.currentAccount,
      publicKey: this.currentAccount,
      chainId: `stellar:${this.currentNetwork}`,
      network: 'stellar',
    };
  }

  // ─── Balance ───────────────────────────────────────────────────────────────

  async getBalance(token: string): Promise<TokenBalance> {
    if (!this.currentAccount) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    const horizonUrl = this.getHorizonUrl();

    try {
      // Native XLM balance
      if (token.toLowerCase() === 'native' || token.toLowerCase() === 'xlm') {
        const response = await fetch(`${horizonUrl}/accounts/${this.currentAccount}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch account: ${response.statusText}`);
        }

        const accountData = await response.json() as {
          balances: Array<{ asset_type: string; balance: string }>;
        };

        const nativeBalance = accountData.balances.find((b) => b.asset_type === 'native');
        const balance = nativeBalance ? nativeBalance.balance : '0';
        const balanceFormatted = parseFloat(balance).toFixed(7);

        return {
          token: 'native',
          symbol: 'XLM',
          decimals: 7,
          balance,
          balanceFormatted: `${balanceFormatted} XLM`,
        };
      }

      // Asset balance (format: CODE:ISSUER)
      const [assetCode, issuer] = token.split(':');

      if (assetCode && issuer) {
        const response = await fetch(`${horizonUrl}/accounts/${this.currentAccount}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch account: ${response.statusText}`);
        }

        const accountData = await response.json() as {
          balances: Array<{
            asset_type: string;
            asset_code?: string;
            asset_issuer?: string;
            balance: string;
          }>;
        };

        const assetBalance = accountData.balances.find(
          (b) => b.asset_code === assetCode && b.asset_issuer === issuer
        );

        const balance = assetBalance ? assetBalance.balance : '0';
        const balanceFormatted = parseFloat(balance).toFixed(7);

        return {
          token,
          symbol: assetCode,
          decimals: 7,
          balance,
          balanceFormatted: `${balanceFormatted} ${assetCode}`,
        };
      }

      return {
        token,
        symbol: token,
        decimals: 7,
        balance: '0',
        balanceFormatted: `0 ${token}`,
      };
    } catch (error) {
      throw this.createError('BALANCE_FETCH_FAILED', `Failed to fetch balance for ${token}`, error);
    }
  }

  async getAllBalances(): Promise<TokenBalance[]> {
    if (!this.currentAccount) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    const horizonUrl = this.getHorizonUrl();

    try {
      const response = await fetch(`${horizonUrl}/accounts/${this.currentAccount}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch account: ${response.statusText}`);
      }

      const accountData = await response.json() as {
        balances: Array<{
          asset_type: string;
          asset_code?: string;
          asset_issuer?: string;
          balance: string;
        }>;
      };

      const balances: TokenBalance[] = accountData.balances.map((balance) => {
        if (balance.asset_type === 'native') {
          return {
            token: 'native',
            symbol: 'XLM',
            decimals: 7,
            balance: balance.balance,
            balanceFormatted: `${parseFloat(balance.balance).toFixed(7)} XLM`,
          };
        }

        const tokenId = balance.asset_code && balance.asset_issuer
          ? `${balance.asset_code}:${balance.asset_issuer}`
          : balance.asset_code || 'unknown';

        return {
          token: tokenId,
          symbol: balance.asset_code || 'unknown',
          decimals: 7,
          balance: balance.balance,
          balanceFormatted: `${parseFloat(balance.balance).toFixed(7)} ${balance.asset_code || 'unknown'}`,
        };
      });

      return balances;
    } catch (error) {
      throw this.createError('BALANCE_FETCH_FAILED', 'Failed to fetch balances', error);
    }
  }

  // ─── Network Switching ─────────────────────────────────────────────────────

  async switchNetwork(chainId: ChainId): Promise<void> {
    if (!this.supportedChains.includes(chainId)) {
      throw this.createError('NETWORK_NOT_SUPPORTED', `Network ${chainId} is not supported`);
    }

    const network = chainId.replace('stellar:', '');
    this.currentNetwork = network;

    this.emit('chainChanged', { chainId });
    this.emit('networkChanged', { chainId, network: 'stellar' });
  }

  // ─── Signing & Transactions ────────────────────────────────────────────────

  async sign(data: string | object): Promise<string> {
    if (!this.provider || !this.currentAccount) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    try {
      const result = await this.provider.signData(data);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error) {
      if (this.isUserRejectedError(error)) {
        throw this.createError('USER_REJECTED', 'User rejected the signing request');
      }
      throw this.createError('SIGN_FAILED', 'Failed to sign data', error);
    }
  }

  async sendTransaction(transaction: WalletTransaction): Promise<string> {
    if (!this.provider || !this.currentAccount) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    try {
      const signedTx = await this.provider.signTransaction(transaction);

      const txHash = typeof signedTx === 'string'
        ? signedTx.slice(0, 64)
        : 'stellar_tx_' + Date.now();

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

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Get the Horizon URL for the current network
   */
  protected getHorizonUrl(): string {
    const chainId = `stellar:${this.currentNetwork}`;
    return this.options.horizonUrls?.[chainId] || STELLAR_HORIZON_URLS[chainId] || STELLAR_HORIZON_URLS[STELLAR_CHAINS.PUBLIC];
  }

  /**
   * Check if error indicates user rejection
   */
  protected isUserRejectedError(error: unknown): boolean {
    if (error instanceof Error) {
      return (
        error.message.includes('User rejected') ||
        error.message.includes('user rejected') ||
        error.message.includes('cancelled') ||
        error.message.includes('denied')
      );
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
