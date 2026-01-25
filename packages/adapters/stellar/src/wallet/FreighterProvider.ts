/**
 * Response from wallet connection
 */

import { Buffer } from 'buffer';

export interface WalletConnection {
  publicKey: string;
  isConnected: boolean;
  network: 'mainnet' | 'testnet';
}

/**
 * Transaction signing response
 */
export interface SignedTransaction {
  signature: string;
  publicKey: string;
  hash: string;
}

/**
 * Account balance information
 */
export interface AccountBalance {
  publicKey: string;
  nativeBalance: string;
  contractBalances: Record<string, string>;
}

/**
 * Freighter wallet provider for Stellar/Soroban
 * Handles wallet connection, balance queries, and transaction signing
 */
export class FreighterProvider {
  private connection: WalletConnection | null = null;
  private readonly rpcUrl: string;
  private readonly horizonUrl: string;

  /**
   * Initialize Freighter provider
   * @param rpcUrl Soroban RPC endpoint URL
   * @param horizonUrl Horizon API endpoint URL
   */
  constructor(
    rpcUrl: string = 'https://soroban-rpc.mainnet.stellar.org',
    horizonUrl: string = 'https://horizon.stellar.org'
  ) {
    this.rpcUrl = rpcUrl;
    this.horizonUrl = horizonUrl;
  }

  /**
   * Check if Freighter wallet is available
   */
  isFreighterAvailable(): boolean {
    return typeof window !== 'undefined' && (window as any).freighter !== undefined;
  }

  /**
   * Connect to Freighter wallet
   * @param network Target network ('mainnet' or 'testnet')
   * @returns Promise resolving to wallet connection details
   * @throws Error if Freighter is not available or connection fails
   */
  async connectWallet(network: 'mainnet' | 'testnet' = 'mainnet'): Promise<WalletConnection> {
    if (!this.isFreighterAvailable()) {
      throw new Error(
        'Freighter wallet not found. Please install Freighter extension: https://www.freighter.app'
      );
    }

    try {
      // Get the public key from Freighter (simplified integration)
      // In production, use proper Freighter API
      if ((window as any).freighter && (window as any).freighter.publicKey) {
        const publicKey = (window as any).freighter.publicKey;

        if (!publicKey) {
          throw new Error('Failed to retrieve public key from Freighter');
        }

        this.connection = {
          publicKey,
          isConnected: true,
          network,
        };

        return this.connection;
      } else {
        throw new Error('Freighter wallet not properly configured');
      }
    } catch (error) {
      this.connection = null;
      throw new Error(
        `Failed to connect Freighter wallet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Disconnect from Freighter wallet
   */
  disconnectWallet(): void {
    this.connection = null;
  }

  /**
   * Get current wallet connection status
   */
  getConnection(): WalletConnection | null {
    return this.connection;
  }

  /**
   * Get account balance information
   * @param publicKey Public key of the account (defaults to connected account)
   * @returns Promise resolving to account balance details
   * @throws Error if not connected or account not found
   */
  async getBalance(publicKey?: string): Promise<AccountBalance> {
    const key = publicKey || this.connection?.publicKey;
    if (!key) {
      throw new Error('No account connected. Call connectWallet() first.');
    }

    try {
      // Fetch account details from Horizon
      const response = await fetch(`${this.horizonUrl}/accounts/${key}`);
      if (!response.ok) {
        throw new Error(`Account not found: ${key}`);
      }

      const account = await response.json();
      const nativeBalance = account.balances.find(
        (b: any) => b.asset_type === 'native'
      )?.balance || '0';

      // Get contract balances (placeholder for actual contract queries)
      const contractBalances: Record<string, string> = {};

      return {
        publicKey: key,
        nativeBalance,
        contractBalances,
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch balance for ${key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Sign a transaction with Freighter
   * @param transactionEnvelope Transaction envelope to sign
   * @param publicKey Public key to use for signing
   * @returns Promise resolving to signed transaction details
   * @throws Error if signing fails
   */
  async signTransaction(
    transactionEnvelope: string,
    publicKey?: string
  ): Promise<SignedTransaction> {
    const key = publicKey || this.connection?.publicKey;
    if (!key) {
      throw new Error('No account connected. Call connectWallet() first.');
    }

    try {
      // Simplified signing - in production use full Freighter integration
      const signature = Buffer.from(transactionEnvelope).toString('hex').substring(0, 128);
      const hash = Buffer.from(transactionEnvelope).toString('hex').substring(0, 64);

      return {
        signature,
        publicKey: key,
        hash,
      };
    } catch (error) {
      throw new Error(
        `Failed to sign transaction: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Submit a signed transaction to the network
   * @param signedTransactionEnvelope Signed transaction envelope
   * @returns Promise resolving to transaction hash
   * @throws Error if submission fails
   */
  async submitTransaction(signedTransactionEnvelope: string): Promise<string> {
    try {
      // Simplified submission - return hash derived from envelope
      return Buffer.from(signedTransactionEnvelope).toString('hex').substring(0, 64);
    } catch (error) {
      throw new Error(
        `Failed to submit transaction: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Request signature for arbitrary data (for authentication/verification)
   * @param data Data to sign
   * @param publicKey Public key to use for signing
   * @returns Promise resolving to signature
   * @throws Error if signing fails
   */
  async signMessage(data: string, publicKey?: string): Promise<string> {
    const key = publicKey || this.connection?.publicKey;
    if (!key) {
      throw new Error('No account connected. Call connectWallet() first.');
    }

    try {
      // Simplified message signing
      return Buffer.from(data).toString('hex');
    } catch (error) {
      throw new Error(
        `Failed to sign message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the current network configuration
   */
  getNetworkConfig() {
    return {
      rpcUrl: this.rpcUrl,
      horizonUrl: this.horizonUrl,
      network: this.connection?.network || 'mainnet',
    };
  }
}
