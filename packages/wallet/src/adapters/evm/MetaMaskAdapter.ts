/**
 * MetaMask Wallet Adapter
 * Connects to MetaMask (or other injected EIP-1193 providers)
 */

import { EVMBaseAdapter } from './EVMBaseAdapter';
import type { EVMAdapterOptions } from './EVMBaseAdapter';
import type { EVMProvider, WindowWithEthereum } from '../../types';
import { numericToEvmChainId } from '../../types';

declare const window: WindowWithEthereum & {
  ethereum?: EVMProvider & { providers?: EVMProvider[] };
};

export interface MetaMaskAdapterOptions extends EVMAdapterOptions {
  /** Whether to also detect non-MetaMask injected providers */
  detectAllProviders?: boolean;
}

/**
 * MetaMask wallet adapter
 * Connects to the MetaMask browser extension or other injected EIP-1193 providers
 *
 * @example
 * ```ts
 * const adapter = new MetaMaskAdapter();
 * if (adapter.isAvailable) {
 *   const account = await adapter.connect();
 *   console.log('Connected:', account.address);
 * }
 * ```
 */
export class MetaMaskAdapter extends EVMBaseAdapter {
  readonly id = 'metamask';
  readonly name = 'MetaMask';
  readonly type = 'metamask' as const;
  readonly icon = 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg';

  private metamaskOptions: MetaMaskAdapterOptions;

  constructor(options: MetaMaskAdapterOptions = {}) {
    super(options);
    this.metamaskOptions = options;
  }

  /**
   * Check if MetaMask (or another injected EVM provider) is available
   */
  get isAvailable(): boolean {
    if (typeof (globalThis as any).window === 'undefined') return false;
    const windowWithEthereum = (globalThis as any).window as WindowWithEthereum;
    return !!windowWithEthereum.ethereum;
  }

  /**
   * Check if the connected provider is specifically MetaMask
   */
  get isMetaMask(): boolean {
    if (!this.provider) return false;
    return !!(this.provider as EVMProvider).isMetaMask;
  }

  /**
   * Get all detected EVM providers (when multiple wallets are installed)
   */
  getDetectedProviders(): { name: string; provider: EVMProvider }[] {
    if (typeof (globalThis as any).window === 'undefined') return [];

    const windowWithEthereum = (globalThis as any).window as WindowWithEthereum & {
      ethereum?: EVMProvider & { providers?: EVMProvider[] };
    };

    if (!windowWithEthereum.ethereum) return [];

    // Multiple providers (MetaMask + another wallet)
    if (windowWithEthereum.ethereum.providers) {
      return windowWithEthereum.ethereum.providers.map((p) => ({
        name: p.isMetaMask ? 'MetaMask' : (p.isWalletConnect ? 'WalletConnect' : 'Unknown'),
        provider: p,
      }));
    }

    return [{ name: windowWithEthereum.ethereum.isMetaMask ? 'MetaMask' : 'Injected', provider: windowWithEthereum.ethereum }];
  }

  /**
   * Get the EVM provider from window.ethereum
   */
  protected getProvider(): EVMProvider | null {
    if (typeof (globalThis as any).window === 'undefined') return null;

    const windowWithEthereum = (globalThis as any).window as WindowWithEthereum & {
      ethereum?: EVMProvider & { providers?: EVMProvider[] };
    };

    if (!windowWithEthereum.ethereum) return null;

    // If multiple providers, prefer MetaMask
    if (windowWithEthereum.ethereum.providers) {
      const metaMaskProvider = windowWithEthereum.ethereum.providers.find(
        (p) => p.isMetaMask
      );
      return metaMaskProvider || windowWithEthereum.ethereum.providers[0] || null;
    }

    return windowWithEthereum.ethereum;
  }

  /**
   * Connect with optional batched account request
   * Uses eth_accounts first (no popup), falls back to eth_requestAccounts
   */
  async connectSilent(): Promise<string | null> {
    const provider = this.getProvider();
    if (!provider) return null;

    try {
      const accounts = await provider.request({
        method: 'eth_accounts',
      }) as string[];

      if (accounts && accounts.length > 0) {
        this.provider = provider;
        this.currentAccount = accounts[0];

        const chainIdHex = await provider.request({
          method: 'eth_chainId',
        }) as string;

        const numericChainId = parseInt(chainIdHex, 16);
        this.currentChainId = numericToEvmChainId(numericChainId);

        return this.currentAccount;
      }

      return null;
    } catch {
      return null;
    }
  }
}
