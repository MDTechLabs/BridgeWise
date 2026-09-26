/**
 * Soroban Transfer Lifecycle — Core Types
 *
 * Defines all lifecycle stages, event shapes, and analysis interfaces
 * for Soroban/Stellar cross-chain transfers.
 */

/**
 * Ordered lifecycle stages for a Soroban transfer.
 * Each stage must complete before the next begins.
 */
export enum LifecycleStage {
  /** Transfer request submitted by user */
  INITIATED = 'initiated',
  /** Source-chain validation passed */
  VALIDATED = 'validated',
  /** Liquidity reserved on source chain */
  LIQUIDITY_RESERVED = 'liquidity_reserved',
  /** Source-chain transaction submitted */
  SOURCE_TX_SUBMITTED = 'source_tx_submitted',
  /** Source-chain transaction confirmed */
  SOURCE_TX_CONFIRMED = 'source_tx_confirmed',
  /** Soroban contract invoked */
  SOROBAN_CONTRACT_INVOKED = 'soroban_contract_invoked',
  /** Soroban contract execution confirmed */
  SOROBAN_CONTRACT_CONFIRMED = 'soroban_contract_confirmed',
  /** Destination-chain transaction submitted */
  DESTINATION_TX_SUBMITTED = 'destination_tx_submitted',
  /** Destination-chain transaction confirmed */
  DESTINATION_TX_CONFIRMED = 'destination_tx_confirmed',
  /** Transfer fully settled and funds delivered */
  SETTLED = 'settled',
  /** Terminal: transfer failed at any stage */
  FAILED = 'failed',
}

/**
 * Final outcome of a transfer.
 */
export enum TransferOutcome {
  SUCCESS = 'success',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
}

/**
 * Human-readable label for each stage transition.
 */
export const STAGE_LABELS: Record<LifecycleStage, string> = {
  [LifecycleStage.INITIATED]: 'Initiated',
  [LifecycleStage.VALIDATED]: 'Validated',
  [LifecycleStage.LIQUIDITY_RESERVED]: 'Liquidity Reserved',
  [LifecycleStage.SOURCE_TX_SUBMITTED]: 'Source Tx Submitted',
  [LifecycleStage.SOURCE_TX_CONFIRMED]: 'Source Tx Confirmed',
  [LifecycleStage.SOROBAN_CONTRACT_INVOKED]: 'Soroban Contract Invoked',
  [LifecycleStage.SOROBAN_CONTRACT_CONFIRMED]: 'Soroban Contract Confirmed',
  [LifecycleStage.DESTINATION_TX_SUBMITTED]: 'Destination Tx Submitted',
  [LifecycleStage.DESTINATION_TX_CONFIRMED]: 'Destination Tx Confirmed',
  [LifecycleStage.SETTLED]: 'Settled',
  [LifecycleStage.FAILED]: 'Failed',
};

/**
 * Ordered happy-path stages (excludes FAILED terminal stage).
 */
export const ORDERED_STAGES: LifecycleStage[] = [
  LifecycleStage.INITIATED,
  LifecycleStage.VALIDATED,
  LifecycleStage.LIQUIDITY_RESERVED,
  LifecycleStage.SOURCE_TX_SUBMITTED,
  LifecycleStage.SOURCE_TX_CONFIRMED,
  LifecycleStage.SOROBAN_CONTRACT_INVOKED,
  LifecycleStage.SOROBAN_CONTRACT_CONFIRMED,
  LifecycleStage.DESTINATION_TX_SUBMITTED,
  LifecycleStage.DESTINATION_TX_CONFIRMED,
  LifecycleStage.SETTLED,
];

/**
 * A single stage event recorded during a transfer's lifecycle.
 */
export interface LifecycleEvent {
  transferId: string;
  stage: LifecycleStage;
  timestamp: Date;
  /** Duration from the previous stage in milliseconds */
  durationFromPreviousMs?: number;
  /** Optional error message when stage === FAILED */
  errorMessage?: string;
  /** Arbitrary metadata (tx hash, block number, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Per-stage aggregated statistics across many transfers.
 */
export interface StageStatistics {
  stage: LifecycleStage;
  label: string;
  /** How many transfers reached this stage */
  reachCount: number;
  /** How many failed at this specific stage */
  failCount: number;
  /** Failure rate for this stage (0–1) */
  stageFailureRate: number;
  /** Average duration from previous stage (ms) */
  avgDurationMs: number;
  /** Median duration from previous stage (ms) */
  medianDurationMs: number;
  /** 95th-percentile duration (ms) */
  p95DurationMs: number;
  /** Minimum duration recorded (ms) */
  minDurationMs: number;
  /** Maximum duration recorded (ms) */
  maxDurationMs: number;
}

/**
 * Identified bottleneck stage in the pipeline.
 */
export interface BottleneckInfo {
  stage: LifecycleStage;
  label: string;
  /** Average duration at this stage, in ms */
  avgDurationMs: number;
  /** Percentage of total transfer time consumed by this stage */
  percentOfTotalTime: number;
  /** Failure count at this stage */
  failCount: number;
  /** Severity classification */
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Full analytics report for Soroban transfer lifecycle.
 */
export interface LifecycleAnalyticsReport {
  /** Total transfers analysed */
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  timedOutTransfers: number;
  /** Overall success rate (0–100) */
  overallSuccessRate: number;
  /** Average end-to-end duration for successful transfers (ms) */
  avgTotalDurationMs: number;
  /** Median end-to-end duration (ms) */
  medianTotalDurationMs: number;
  /** P95 end-to-end duration (ms) */
  p95TotalDurationMs: number;
  /** Per-stage breakdown */
  stageStats: StageStatistics[];
  /** Detected bottlenecks, ranked by severity */
  bottlenecks: BottleneckInfo[];
  /** Timestamp of report generation */
  generatedAt: Date;
}

/**
 * Payload used to record a single lifecycle event.
 */
export interface RecordLifecycleEventPayload {
  transferId: string;
  stage: LifecycleStage;
  timestamp?: Date;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Query filters for lifecycle analytics.
 */
export interface LifecycleAnalyticsQuery {
  sourceChain?: string;
  destinationChain?: string;
  asset?: string;
  bridgeName?: string;
  startDate?: Date;
  endDate?: Date;
  /** If set, only analyse transfers that failed */
  failedOnly?: boolean;
}
