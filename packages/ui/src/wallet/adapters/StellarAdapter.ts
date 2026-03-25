'use client';

import type {
  WalletAdapter,
  WalletAccount,
  TokenBalance,
  WalletError,
  WalletEvent,
  WalletEventCallback,
  ChainId,
  WalletTransaction,
  StellarProvider,
  WindowWithStellar,
} from '../types';

// Stellar network passphrases
const STELLAR_PUBLIC = 'Public Global Stellar Network ; September 2015';
const STELLAR_TESTNET = 'Test SDF Network ; September 2015';
const STELLAR_FUTURENET = 'Test SDF Future Network ; October 2022';

// Supported chains (Stellar networks)
const SUPPORTED_CHAINS: ChainId[] = ['stellar:public', 'stellar:testnet', 'stellar:futurenet'];

// Default to public network
const DEFAULT_NETWORK = 'stellar:public';

// Network name mapping
const NETWORK_NAMES: Record<string, string> = {
  'stellar:public': 'Public',
  'stellar:testnet': 'Testnet',
  'stellar:futurenet': 'Futurenet',
};

// Network passphrase mapping
const NETWORK_PASSPHRASES: Record<string, string> = {
  'stellar:public': STELLAR_PUBLIC,
  'stellar:testnet': STELLAR_TESTNET,
  'stellar:futurenet': STELLAR_FUTURENET,
};

// Stellar horizon URLs
const HORIZON_URLS: Record<string, string> = {
  'stellar:public': 'https://horizon.stellar.org',
  'stellar:testnet': 'https://horizon-testnet.stellar.org',
  'stellar:futurenet': 'https://horizon-futurenet.stellar.org',
};

/**
 * Stellar wallet adapter options
 */
export interface StellarAdapterOptions {
  /** Preferred wallet provider (freighter, rabet, albedo, xbull) */
  preferredProvider?: 'freighter' | 'rabet' | 'albedo' | 'xbull';
  /** Default network */
  network?: 'public' | 'testnet' | 'futurenet';
}

/**
 * Stellar wallet adapter
 * Supports multiple Stellar wallet providers
 */
export class StellarAdapter implements WalletAdapter {
  readonly id = 'stellar';
  readonly name = 'Stellar Wallet';
  readonly type = 'stellar' as const;
  readonly networkType = 'stellar' as const;
  readonly supportedChains = SUPPORTED_CHAINS;
  readonly icon = 'https://stellar.org/favicon.ico';

  private preferredProvider: string | undefined;
  private currentNetwork: string;
  private provider: StellarProvider | null = null;
  private eventListeners: Map<WalletEvent, Set<WalletEventCallback>> = new Map();
  private currentAccount: string | null = null;

  constructor(options: StellarAdapterOptions = {}) {
    this.preferredProvider = options.preferredProvider;
    this.currentNetwork = options.network || 'public';
  }

  /**
   * Check if any Stellar wallet is available
   */
  get isAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    const windowWithStellar = window as WindowWithStellar;
    return !!(
      windowWithStellar.freighter ||
      windowWithStellar.rabet ||
      windowWithStellar.albedo ||
      windowWithStellar.xBull
    );
  }

  /**
   * Get available Stellar providers
   */
  getAvailableProviders(): { id: string; name: string; available: boolean }[] {
    if (typeof window === 'undefined') return [];
    const windowWithStellar = window as WindowWithStellar;

    return [
      { id: 'freighter', name: 'Freighter', available: !!windowWithStellar.freighter },
      { id: 'rabet', name: 'Rabet', available: !!windowWithStellar.rabet },
      { id: 'albedo', name: 'Albedo', available: !!windowWithStellar.albedo },
      { id: 'xbull', name: 'xBull', available: !!windowWithStellar.xBull },
    ];
  }

  /**
   * Detect and select the best available provider
   */
  private detectProvider(): StellarProvider | null {
    if (typeof window === 'undefined') return null;
    const windowWithStellar = window as WindowWithStellar;

    // Try preferred provider first
    if (this.preferredProvider) {
      const provider = this.getProviderByName(this.preferredProvider, windowWithStellar);
      if (provider) return provider;
    }

    // Try providers in order of preference
    const providers: (keyof WindowWithStellar)[] = ['freighter', 'rabet', 'albedo', 'xBull'];
    for (const providerName of providers) {
      const provider = windowWithStellar[providerName];
      if (provider) return provider;
    }

    return null;
  }

  /**
   * Get provider by name
   */
  private getProviderByName(
    name: string,
    windowWithStellar: WindowWithStellar
  ): StellarProvider | null {
    const providerMap: Record<string, keyof WindowWithStellar> = {
      freighter: 'freighter',
      rabet: 'rabet',
      albedo: 'albedo',
      xbull: 'xBull',
    };

    const key = providerMap[name.toLowerCase()];
    return key ? windowWithStellar[key] || null : null;
  }

  /**
   * Connect to Stellar wallet
   */
  async connect(chainId?: ChainId): Promise<WalletAccount> {
    this.provider = this.detectProvider();

    if (!this.provider) {
      throw this.createError(
        'WALLET_NOT_FOUND',
        'No Stellar wallet found. Please install Freighter, Rabet, Albedo, or xBull.'
      );
    }

    try {
      // Get public key from provider
      const publicKey = await this.provider.publicKey();

      if (!publicKey) {
        throw this.createError('CONNECTION_FAILED', 'Failed to get public key from wallet');
      }

      this.currentAccount = publicKey;

      // Determine network
      const targetNetwork = chainId ? chainId.replace('stellar:', '') : this.currentNetwork;
      this.currentNetwork = targetNetwork;

      const networkPassphrase = NETWORK_PASSPHRASES[`stellar:${targetNetwork}`];

      // For Freighter, we can get the current network
      if ('getNetwork' in this.provider) {
        try {
          const walletNetwork = await this.provider.getNetwork();
          // Map wallet network to our chain ID format
          if (walletNetwork === STELLAR_PUBLIC) {
            this.currentNetwork = 'public';
          } else if (walletNetwork === STELLAR_TESTNET) {
            this.currentNetwork = 'testnet';
          } else if (walletNetwork === STELLAR_FUTURENET) {
            this.currentNetwork = 'futurenet';
          }
        } catch {
          // Fallback to default
        }
      }

      const account: WalletAccount = {
        address: publicKey,
        publicKey,
        chainId: `stellar:${this.currentNetwork}`,
        network: 'stellar',
      };

      this.emit('connect', account);
      this.setupEventListeners();

      return account;
    } catch (error) {
      if (this.isUserRejectedError(error)) {
        throw this.createError('USER_REJECTED', 'User rejected the connection request');
      }
      throw this.createError('CONNECTION_FAILED', 'Failed to connect to Stellar wallet', error);
    }
  }

  /**
   * Setup event listeners for the provider
   */
  private setupEventListeners(): void {
    // Stellar wallets typically don't have event listeners like EVM wallets
    // We rely on polling or manual refresh for account/network changes
  }

  /**
   * Disconnect from Stellar wallet
   */
  async disconnect(): Promise<void> {
    this.currentAccount = null;
    this.provider = null;
    this.emit('disconnect', null);
  }

  /**
   * Get the current account
   */
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

  /**
   * Get balance for a specific token
   */
  async getBalance(token: string): Promise<TokenBalance> {
    if (!this.currentAccount) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    const horizonUrl = HORIZON_URLS[`stellar:${this.currentNetwork}`];

    try {
      // Native XLM balance
      if (token.toLowerCase() === 'native' || token.toLowerCase() === 'xlm') {
        const response = await fetch(`${horizonUrl}/accounts/${this.currentAccount}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch account: ${response.statusText}`);
        }

        const accountData = (await response.json()) as { balances: Array<{ asset_type: string; balance: string }> };
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

        const accountData = (await response.json()) as {
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

      // Unknown token format
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

  /**
   * Get all balances for the connected account
   */
  async getAllBalances(): Promise<TokenBalance[]> {
    if (!this.currentAccount) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    const horizonUrl = HORIZON_URLS[`stellar:${this.currentNetwork}`];

    try {
      const response = await fetch(`${horizonUrl}/accounts/${this.currentAccount}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch account: ${response.statusText}`);
      }

      const accountData = (await response.json()) as {
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

  /**
   * Switch to a different Stellar network
   */
  async switchNetwork(chainId: ChainId): Promise<void> {
    if (!SUPPORTED_CHAINS.includes(chainId)) {
      throw this.createError('NETWORK_NOT_SUPPORTED', `Network ${chainId} is not supported`);
    }

    const network = chainId.replace('stellar:', '');

    // For Stellar, network switching is typically done in the wallet UI
    // We just update our internal state and emit the event
    this.currentNetwork = network;

    this.emit('chainChanged', { chainId });
    this.emit('networkChanged', { chainId, network: 'stellar' });
  }

  /**
   * Sign data
   */
  async sign(data: string | object): Promise<string> {
    if (!this.provider || !this.currentAccount) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    try {
      // Use signData method
      const result = await this.provider.signData(data);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error) {
      if (this.isUserRejectedError(error)) {
        throw this.createError('USER_REJECTED', 'User rejected the signing request');
      }
      throw this.createError('UNKNOWN_ERROR', 'Failed to sign data', error);
    }
  }

  /**
   * Send a transaction
   */
  async sendTransaction(transaction: WalletTransaction): Promise<string> {
    if (!this.provider || !this.currentAccount) {
      throw this.createError('NOT_CONNECTED', 'Wallet is not connected');
    }

    try {
      // For Stellar, we typically sign the transaction first
      // The transaction hash is returned after submission to the network
      const signedTx = await this.provider.signTransaction(transaction);

      // In a real implementation, you would submit the signed transaction to the Stellar network
      // and return the transaction hash
      const txHash = typeof signedTx === 'string'
        ? signedTx.slice(0, 64) // Mock hash from signed transaction
        : 'mock_tx_hash_' + Date.now();

      return txHash;
    } catch (error) {
      if (this.isUserRejectedError(error)) {
        throw this.createError('USER_REJECTED', 'User rejected the transaction');
      }
      throw this.createError('UNKNOWN_ERROR', 'Failed to send transaction', error);
    }
  }

  /**
   * Subscribe to wallet events
   */
  on(event: WalletEvent, callback: WalletEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from wallet events
   */
  off(event: WalletEvent, callback: WalletEventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emit an event to all registered listeners
   */
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

  /**
   * Check if error is user rejection
   */
  private isUserRejectedError(error: unknown): boolean {
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
  private createError(code: string, message: string, originalError?: unknown): WalletError {
    return {
      code: code as WalletError['code'],
      message,
      originalError,
    };
  }
}

export default StellarAdapter;
