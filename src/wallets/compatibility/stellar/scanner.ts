import type { WalletAdapter } from '../../../../packages/wallet/src';
import type { StellarRoute } from '../../../bridges/stellar/routes/stellar-route-validator';
import { detectSorobanWalletCapabilities } from '../../capabilities/stellar/detector';
import type {
  CompatibilityReport,
  SorobanWalletCapabilities,
  WalletRouteCompatibility,
} from './types';

/**
 * Stellar Wallet Compatibility Scanner
 * Validates wallet compatibility with Stellar bridge routes.
 */
export class StellarWalletCompatibilityScanner {
  /**
   * Scans a wallet's compatibility with a list of routes.
   *
   * @param adapter The wallet adapter to scan.
   * @param routes The Stellar bridge routes to validate compatibility for.
   * @returns A detailed compatibility report.
   */
  async scan(
    adapter: WalletAdapter,
    routes: StellarRoute[]
  ): Promise<CompatibilityReport> {
    const capabilities = await detectSorobanWalletCapabilities(adapter);
    const routeCompatibility: Record<string, WalletRouteCompatibility> = {};

    for (const route of routes) {
      routeCompatibility[route.routeId] = this.validateRouteCompatibility(
        capabilities,
        route
      );
    }

    const overallCompatible = Object.values(routeCompatibility).every(
      (rc) => rc.compatible
    );

    return {
      walletId: capabilities.walletId,
      walletName: capabilities.name || 'Unknown Wallet',
      capabilities,
      routeCompatibility,
      overallCompatible,
      scannedAt: new Date(),
    };
  }

  /**
   * Detects capabilities for a given wallet adapter.
   */
  async detectCapabilities(
    adapter: WalletAdapter
  ): Promise<SorobanWalletCapabilities> {
    return detectSorobanWalletCapabilities(adapter);
  }

  /**
   * Validates if a wallet's capabilities are sufficient for a specific Stellar route.
   */
  validateRouteCompatibility(
    capabilities: SorobanWalletCapabilities,
    route: StellarRoute
  ): WalletRouteCompatibility {
    const reasons: string[] = [];
    const warnings: string[] = [];

    // Basic capability checks
    if (!capabilities.supports.signTransaction) {
      reasons.push('Wallet does not support signing transactions.');
    }

    if (!capabilities.supports.isConnected) {
      reasons.push('Wallet is not connected.');
    }

    // Route-specific checks
    // Example: If it's a Soroban route, check for Soroban RPC support
    const isSorobanRoute = route.bridgeId.toLowerCase().includes('soroban');
    if (isSorobanRoute && !capabilities.supports.sorobanRpc) {
      reasons.push('Route requires Soroban support, but wallet does not support Soroban RPC.');
    }

    // Check for network compatibility if possible
    // (In a real scenario, we might want to check if the wallet's current network matches the route's source chain)
    if (!capabilities.supports.getNetwork) {
      warnings.push('Wallet does not support network detection; ensure you are on the correct network manually.');
    }

    return {
      compatible: reasons.length === 0,
      reasons,
      warnings,
    };
  }
}

export const stellarWalletCompatibilityScanner = new StellarWalletCompatibilityScanner();
