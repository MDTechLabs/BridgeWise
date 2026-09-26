import type { SorobanWalletCapabilities } from '../../capabilities/stellar/detector';
import type { StellarRoute } from '../../../bridges/stellar/routes/stellar-route-validator';

export interface WalletRouteCompatibility {
  compatible: boolean;
  reasons: string[];
  warnings: string[];
}

export interface CompatibilityReport {
  walletId: string;
  walletName: string;
  capabilities: SorobanWalletCapabilities;
  routeCompatibility: Record<string, WalletRouteCompatibility>;
  overallCompatible: boolean;
  scannedAt: Date;
}

export { SorobanWalletCapabilities };
