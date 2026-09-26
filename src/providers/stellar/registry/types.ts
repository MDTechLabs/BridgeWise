// ─── Provider Status ──────────────────────────────────────────────────────────

export type ProviderStatus =
  | 'active'
  | 'inactive'
  | 'degraded'
  | 'maintenance'
  | 'deprecated';

// ─── Provider Kind ────────────────────────────────────────────────────────────

export type ProviderKind = 'soroban' | 'classic' | 'hybrid';

// ─── Fee Model ────────────────────────────────────────────────────────────────

export type FeeModel = 'flat' | 'bps' | 'tiered';

// ─── Asset Support ────────────────────────────────────────────────────────────

export interface SupportedAsset {
  /** Asset code, e.g. "USDC". Stored uppercase. */
  code: string;
  /** Issuer address (classic asset) or SAC contract id (Soroban). */
  issuer?: string;
  /** Whether the asset requires the user to hold a trustline. */
  trustlineRequired?: boolean;
}

// ─── Chain Support ────────────────────────────────────────────────────────────

export interface SupportedChain {
  /** Network/chain identifier (e.g. "stellar", "ethereum", "polygon"). */
  identifier: string;
  /** Asset code used on this chain for settlement. */
  assetCode: string;
}

// ─── Bridge Provider Record ──────────────────────────────────────────────────

export interface StellarBridgeProvider {
  /** Stable identifier, lowercased + trimmed on registration. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Provider classification. */
  kind: ProviderKind;
  /** Bridge contract / endpoint URL. */
  endpoint: string;
  /** Stellar networks the provider accepts (passphrases). */
  networks: string[];
  /** Chains (incl. destination side) supported. */
  chains: SupportedChain[];
  /** Assets the provider can move. */
  assets: SupportedAsset[];
  /** Fee model. */
  feeModel: FeeModel;
  /** Flat fee in USD cents, when feeModel === "flat". */
  flatFeeUsdCents?: number;
  /** Basis-point fee, when feeModel === "bps" or "tiered". 0..10000. */
  feeBps?: number;
  /** Current status. */
  status: ProviderStatus;
  /** Free-form descriptive tags. */
  tags?: string[];
  /** Epoch ms when first registered. */
  registeredAt: number;
  /** Epoch ms when last mutated. */
  updatedAt: number;
}

// ─── Health Snapshot ──────────────────────────────────────────────────────────

export interface HealthSnapshot {
  /** Provider id (normalized). */
  providerId: string;
  /** Whether the latest probe succeeded. */
  healthy: boolean;
  /** Round-trip latency in milliseconds. */
  latencyMs?: number;
  /** Epoch ms when this snapshot was taken. */
  checkedAt: number;
}

// ─── Registration Input ──────────────────────────────────────────────────────

export interface RegisterStellarProviderInput {
  id: string;
  name: string;
  kind: ProviderKind;
  endpoint: string;
  networks: string[];
  chains: SupportedChain[];
  assets: SupportedAsset[];
  feeModel: FeeModel;
  flatFeeUsdCents?: number;
  feeBps?: number;
  status?: ProviderStatus;
  tags?: string[];
}

// ─── Query Filter ────────────────────────────────────────────────────────────

export interface ProviderQuery {
  status?: ProviderStatus;
  kind?: ProviderKind;
  network?: string;
  chain?: string;
  asset?: string;
  tag?: string;
}

// ─── Aggregate Stats ─────────────────────────────────────────────────────────

export interface ProviderRegistryStats {
  totalProviders: number;
  byStatus: Record<ProviderStatus, number>;
  byKind: Record<ProviderKind, number>;
  byNetwork: Record<string, number>;
  supportedAssets: string[];
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class UnknownProviderError extends Error {
  constructor(id: string) {
    super(`Unknown Stellar bridge provider: "${id}"`);
    this.name = 'UnknownProviderError';
  }
}

export class ProviderRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderRegistrationError';
  }
}
