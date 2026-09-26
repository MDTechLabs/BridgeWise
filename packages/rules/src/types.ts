/**
 * Types for the relayer slashing risk and double-sign detection rule engine.
 *
 * @example
 * ```ts
 * import type { AttestationRecord, DoubleSignEvent, SlashingRiskReport } from '@bridgewise/rules';
 * ```
 */

/**
 * Represents a single attestation produced by a relayer node.
 */
export interface AttestationRecord {
  /** Root hash of the cross-chain message being attested. */
  messageRoot: string;
  /** Monotonic sequence number unique per relayer. */
  sequenceNumber: number;
  /** Block height at which the attestation was produced. */
  blockHeight: number;
  /** Public key of the relayer that produced this attestation. */
  relayerKey: string;
  /** Cryptographic signature over the attestation data. */
  signature: string;
  /** Unix timestamp (ms) when the attestation was created. */
  timestamp: number;
}

/**
 * A detected double-sign event where a relayer signed conflicting messages
 * for the same sequence number.
 */
export interface DoubleSignEvent {
  /** Public key of the relayer that double-signed. */
  relayerKey: string;
  /** The first attestation that was recorded. */
  priorAttestation: AttestationRecord;
  /** The conflicting attestation that triggered the detection. */
  conflictingAttestation: AttestationRecord;
  /** Unix timestamp (ms) when the double-sign was detected. */
  detectedAt: number;
}

/**
 * Result of a pre-sign verification check.
 */
export type AttestationVerdict = 'allow' | 'block';

/**
 * Outcome of a pre-sign verification middleware call.
 */
export interface PreSignResult {
  /** Whether the attestation is allowed or should be blocked. */
  verdict: AttestationVerdict;
  /** Human-readable reason when the attestation is blocked. */
  reason?: string;
  /** If blocked due to double-sign, the full event details. */
  doubleSignEvent?: DoubleSignEvent;
}

/**
 * Slashing risk assessment for a single relayer.
 */
export interface SlashingRiskReport {
  /** Public key of the relayer being assessed. */
  relayerKey: string;
  /** Total number of attestations recorded for this relayer. */
  totalAttestations: number;
  /** How many double-sign events were detected. */
  doubleSignCount: number;
  /** Computed risk score from 0 (safe) to 100 (critical). */
  riskScore: number;
  /** Recent double-sign events for this relayer. */
  recentEvents: DoubleSignEvent[];
  /** Whether the risk score exceeds the configured threshold. */
  isAtRisk: boolean;
}

/**
 * Configuration options for the slashing monitor.
 */
export interface SlashingMonitorOptions {
  /** Maximum number of attestations to retain per relayer (default: 1000). */
  maxHistorySize?: number;
  /** Risk score threshold above which a relayer is flagged at-risk (0-100, default: 70). */
  riskThreshold?: number;
  /** Time window in ms for recent event scoring (default: 3600000 = 1 hour). */
  checkWindowMs?: number;
}
