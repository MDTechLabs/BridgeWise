/**
 * Stellar Bridge Liquidity Monitoring Service Types
 *
 * Types for continuous liquidity monitoring, change detection, and report
 * generation across Stellar bridge providers.
 *
 * @see Issue #596 — Implement Stellar Bridge Liquidity Monitoring Service
 */

// ─── Core Data Types ──────────────────────────────────────────────────────────

/** A single liquidity data point collected from a provider. */
export interface LiquidityDataPoint {
  /** Provider/bridge identifier. */
  providerId: string;
  /** Asset symbol (e.g. USDC, XLM). */
  asset: string;
  /** Available liquidity as a string to preserve precision. */
  availableAmount: string;
  /** Total liquidity capacity. */
  totalAmount: string;
  /** Source chain identifier. */
  sourceChain: string;
  /** Destination chain identifier. */
  destinationChain: string;
  /** Timestamp of this data point (epoch ms). */
  timestamp: number;
  /** Utilization rate of the available liquidity (0–1). */
  utilizationRate: number;
}

/** A detected change in liquidity for a given provider/asset pair. */
export interface LiquidityChangeEvent {
  /** Provider/bridge identifier. */
  providerId: string;
  /** Asset symbol. */
  asset: string;
  /** Previous available amount. */
  previousAmount: string;
  /** Current available amount. */
  currentAmount: string;
  /** Absolute change (current - previous) as BigInt-compatible string. */
  deltaAmount: string;
  /** Percentage change (0–100). Negative = decrease. */
  deltaPercent: number;
  /** Direction of the change. */
  direction: LiquidityChangeDirection;
  /** Timestamp of the change detection (epoch ms). */
  timestamp: number;
}

export type LiquidityChangeDirection = 'increase' | 'decrease' | 'unchanged';

// ─── Monitoring Configuration ─────────────────────────────────────────────────

/** Configuration for the liquidity monitoring service. */
export interface LiquidityMonitoringConfig {
  /** Interval between collection cycles in ms (default: 30000). */
  collectionIntervalMs?: number;
  /** How many data points to retain per provider/asset pair (default: 1000). */
  historySize?: number;
  /** Minimum percentage change to trigger a change event (default: 5). */
  changeThresholdPercent?: number;
  /** Alert thresholds for low liquidity per asset. */
  alertThresholds?: LiquidityAlertThreshold[];
}

/** Threshold configuration for low-liquidity alerts. */
export interface LiquidityAlertThreshold {
  /** Asset symbol this threshold applies to. */
  asset: string;
  /** Amount below which a warning alert is emitted. */
  warningAmount: string;
  /** Amount below which a critical alert is emitted. */
  criticalAmount: string;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

/** A liquidity alert emitted when thresholds are breached. */
export interface LiquidityAlert {
  /** Provider/bridge identifier. */
  providerId: string;
  /** Asset symbol. */
  asset: string;
  /** Current available amount. */
  availableAmount: string;
  /** Threshold that was breached. */
  threshold: string;
  /** Severity level of the alert. */
  severity: LiquidityAlertSeverity;
  /** Timestamp (epoch ms). */
  timestamp: number;
  /** Whether this alert is still active. */
  active: boolean;
  /** When the alert was resolved, if applicable. */
  resolvedAt?: number;
}

export type LiquidityAlertSeverity = 'warning' | 'critical';

// ─── Reports ──────────────────────────────────────────────────────────────────

/** A generated liquidity monitoring report. */
export interface LiquidityReport {
  /** Report identifier. */
  id: string;
  /** When the report was generated (epoch ms). */
  generatedAt: number;
  /** The time window covered by this report in ms. */
  windowMs: number;
  /** Per-asset breakdown of liquidity status. */
  assets: LiquidityAssetReport[];
  /** Summary statistics across all assets and providers. */
  summary: LiquiditySummary;
}

/** Per-asset section of a liquidity report. */
export interface LiquidityAssetReport {
  /** Asset symbol. */
  asset: string;
  /** Number of providers offering this asset. */
  providerCount: number;
  /** Total available liquidity across all providers. */
  totalAvailable: string;
  /** Average utilization rate across providers (0–1). */
  avgUtilization: number;
  /** Number of providers at warning level. */
  warningCount: number;
  /** Number of providers at critical level. */
  criticalCount: number;
  /** Providers at risk. */
  atRiskProviders: string[];
  /** Average change in liquidity over the period (percentage). */
  avgChangePercent: number;
}

/** Summary statistics across the entire report. */
export interface LiquiditySummary {
  /** Total number of providers monitored. */
  totalProviders: number;
  /** Total number of assets tracked. */
  totalAssets: number;
  /** Number of active alerts. */
  activeAlertCount: number;
  /** Number of warning alerts. */
  warningAlerts: number;
  /** Number of critical alerts. */
  criticalAlerts: number;
  /** When the monitoring service started (epoch ms). */
  monitoringSince: number;
}

// ─── Data Collector Function ──────────────────────────────────────────────────

/** A function that collects current liquidity data from a provider. */
export type LiquidityDataCollector = (
  asset: string,
) => Promise<LiquidityDataPoint>;

/** Registered provider for liquidity collection. */
export interface LiquidityProviderRegistration {
  /** Provider identifier. */
  providerId: string;
  /** Function to collect liquidity data. */
  collector: LiquidityDataCollector;
  /** Assets this provider supports. */
  assets: string[];
}
