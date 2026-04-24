/**
 * Freighter Wallet Adapter
 * Connects to the Freighter browser extension for Stellar
 */

import { StellarBaseAdapter } from './StellarBaseAdapter';
import type { StellarAdapterOptions } from './StellarBaseAdapter';
import type { StellarProvider, WindowWithStellar } from '../../types';

export interface FreighterAdapterOptions extends StellarAdapterOptions {
  /** Freighter RPC URL (for Soroban) */
  rpcUrl?: string;
}

/**
 * Freighter wallet adapter for Stellar
 * Connects to the Freighter browser extension
 *
 * @example
 * ```ts
 * const adapter = new FreighterAdapter();
 * if (adapter.isAvailable) {
 *   const account = await adapter.connect();
 *   console.log('Connected:', account.address);
 * }
 * ```
 */
export class FreighterAdapter extends StellarBaseAdapter {
  readonly id = 'freighter';
  readonly name = 'Freighter';
  readonly type = 'freighter' as const;
  readonly icon = 'https://freighter.app/favicon.ico';

  private freighterOptions: FreighterAdapterOptions;

  constructor(options: FreighterAdapterOptions = {}) {
    super({ ...options, preferredProvider: 'freighter' });
    this.freighterOptions = options;
  }

  /**
   * Check if Freighter wallet extension is available
   */
  get isAvailable(): boolean {
    if (typeof (globalThis as any).window === 'undefined') return false;
    const windowWithStellar = (globalThis as any).window as WindowWithStellar;
    return !!windowWithStellar.freighter;
  }

  /**
   * Get the Freighter Stellar provider
   */
  protected getProvider(): StellarProvider | null {
    if (typeof (globalThis as any).window === 'undefined') return null;
    const windowWithStellar = (globalThis as any).window as WindowWithStellar;
    return windowWithStellar.freighter || null;
  }

  /**
   * Get Freighter-specific network info
   */
  async getFreighterNetwork(): Promise<string> {
    const provider = this.getProvider();
    if (!provider) {
      throw this.createError('WALLET_NOT_FOUND', 'Freighter wallet not found');
    }

    try {
      return await provider.getNetwork();
    } catch (error) {
      throw this.createError('UNKNOWN_ERROR', 'Failed to get Freighter network', error);
    }
  }
}
