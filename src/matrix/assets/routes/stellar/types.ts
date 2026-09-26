/**
 * Stellar Asset Route Matrix Types
 * Defines types for mapping available routes for every supported asset.
 */

export type AssetChain = 'stellar' | 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'solana';

export type RouteStatus = 'active' | 'inactive' | 'deprecated' | 'maintenance';

export interface BridgeRoute {
  /** Unique route identifier, e.g. "stellar-ethereum-allbridge-USDC" */
  id: string;
  /** Source chain */
  fromChain: AssetChain;
  /** Destination chain */
  toChain: AssetChain;
  /** Bridge protocol used, e.g. "Allbridge", "Stellar bridge" */
  bridgeProtocol: string;
  /** Provider responsible for this route */
  provider: string;
  /** Assets supported by this route */
  supportedAssets: string[];
  /** Estimated transfer time in minutes */
  estimatedTimeMinutes: number;
  /** Current operational status */
  status: RouteStatus;
  /** Whether this route is currently available */
  available: boolean;
  /** Route-specific fee basis points (0-10000, where 100 = 1%) */
  feeBps?: number;
  /** Minimum transfer amount in the source asset's smallest unit */
  minAmount?: string;
  /** Maximum transfer amount in the source asset's smallest unit */
  maxAmount?: string;
  /** When this route was last verified */
  lastVerified?: string;
}

export interface AssetRouteEntry {
  /** Asset symbol (uppercase) */
  asset: string;
  /** Available routes for this asset */
  routes: BridgeRoute[];
  /** Total number of available routes */
  availableCount: number;
  /** Total number of registered routes (including inactive) */
  totalCount: number;
}

export interface RouteMatrix {
  /** Timestamp when the matrix was generated */
  generatedAt: string;
  /** Map of asset symbol → route entry */
  assets: Record<string, AssetRouteEntry>;
  /** Total unique assets tracked */
  totalAssets: number;
  /** Total unique routes across all assets */
  totalRoutes: number;
  /** Total unique bridge protocols */
  bridgeProtocols: string[];
  /** Total unique providers */
  providers: string[];
  /** Chain coverage */
  chains: AssetChain[];
}

export interface RouteMatrixStats {
  totalAssets: number;
  totalRoutes: number;
  activeRoutes: number;
  inactiveRoutes: number;
  totalProviders: number;
  totalProtocols: number;
  chainPairs: number;
  assetWithMostRoutes: { asset: string; count: number } | null;
  assetWithFewestRoutes: { asset: string; count: number } | null;
}

export interface RouteQuery {
  /** Filter by source chain */
  fromChain?: AssetChain;
  /** Filter by destination chain */
  toChain?: AssetChain;
  /** Filter by bridge protocol */
  bridgeProtocol?: string;
  /** Filter by provider */
  provider?: string;
  /** Filter by status */
  status?: RouteStatus;
  /** Only return available routes */
  availableOnly?: boolean;
}

export interface RouteMatrixExport {
  /** Export format version */
  version: string;
  /** The full route matrix */
  matrix: RouteMatrix;
  /** Export metadata */
  metadata: {
    exportedAt: string;
    totalAssets: number;
    totalRoutes: number;
  };
}
