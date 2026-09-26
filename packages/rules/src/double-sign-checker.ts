/**
 * Double-sign checker for cross-chain relayer nodes.
 *
 * Tracks outgoing attestations produced by relayer signing keys and flags
 * conflicting signatures issued for identical sequence numbers — a condition
 * that can result in immediate stake slashing on consensus layers.
 *
 * @example
 * ```ts
 * const checker = new DoubleSignChecker();
 * const event = checker.recordAttestation(attestation);
 * if (event) {
 *   console.warn('Double-sign detected!', event);
 * }
 * ```
 */

import {
  AttestationRecord,
  AttestationVerdict,
  DoubleSignEvent,
  PreSignResult,
  SlashingRiskReport,
} from "./types";

const DEFAULT_MAX_HISTORY = 1000;

/**
 * Key used to group attestations by relayer + sequence number.
 */
function conflictKey(attestation: Pick<AttestationRecord, "relayerKey" | "sequenceNumber">): string {
  return `${attestation.relayerKey}:${attestation.sequenceNumber}`;
}

/**
 * Tracks relayer attestations and detects double-sign conflicts.
 */
export class DoubleSignChecker {
  private readonly attestations: Map<string, AttestationRecord> = new Map();
  private readonly doubleSignEvents: DoubleSignEvent[] = [];
  private readonly maxHistory: number;

  constructor(options?: { maxHistorySize?: number }) {
    this.maxHistory = options?.maxHistorySize ?? DEFAULT_MAX_HISTORY;
  }

  /**
   * Record a new attestation and check for double-sign conflicts.
   *
   * Returns a `DoubleSignEvent` if a conflict is detected, or `null` if
   * the attestation is consistent with history.
   */
  recordAttestation(attestation: AttestationRecord): DoubleSignEvent | null {
    const key = conflictKey(attestation);
    const existing = this.attestations.get(key);

    if (existing) {
      if (existing.messageRoot !== attestation.messageRoot) {
        const event: DoubleSignEvent = {
          relayerKey: attestation.relayerKey,
          priorAttestation: existing,
          conflictingAttestation: attestation,
          detectedAt: Date.now(),
        };
        this.doubleSignEvents.push(event);
        return event;
      }
      return null;
    }

    if (this.attestations.size >= this.maxHistory) {
      const firstKey = this.attestations.keys().next().value;
      if (firstKey !== undefined) {
        this.attestations.delete(firstKey);
      }
    }

    this.attestations.set(key, attestation);
    return null;
  }

  /**
   * Check whether a proposed attestation would conflict with existing history.
   * Call this *before* signing to prevent double-sign conditions.
   */
  checkForConflict(
    messageRoot: string,
    sequenceNumber: number,
    blockHeight: number,
    relayerKey: string,
  ): PreSignResult {
    const key = conflictKey({ relayerKey, sequenceNumber });
    const existing = this.attestations.get(key);

    if (existing && existing.messageRoot !== messageRoot) {
      const doubleSignEvent: DoubleSignEvent = {
        relayerKey,
        priorAttestation: existing,
        conflictingAttestation: {
          messageRoot,
          sequenceNumber,
          blockHeight,
          relayerKey,
          signature: "",
          timestamp: Date.now(),
        },
        detectedAt: Date.now(),
      };

      return {
        verdict: "block",
        reason: `Double-sign prevented: relayer ${relayerKey} already signed sequence ${sequenceNumber} with a different message root`,
        doubleSignEvent,
      };
    }

    return { verdict: "allow" };
  }

  /**
   * Get a slashing risk report for a specific relayer.
   */
  getRiskReport(relayerKey: string): SlashingRiskReport {
    const relevantEvents = this.doubleSignEvents.filter(
      (e) => e.relayerKey === relayerKey,
    );

    const totalAttestations = Array.from(this.attestations.values()).filter(
      (a) => a.relayerKey === relayerKey,
    ).length;

    const doubleSignCount = relevantEvents.length;

    const now = Date.now();
    const weightedScore = relevantEvents.reduce((score, event) => {
      const ageHours = (now - event.detectedAt) / 3600000;
      const recencyWeight = Math.max(0, 1 - ageHours / 24);
      return score + 25 * recencyWeight;
    }, 0);

    const riskScore = Math.min(100, Math.round(weightedScore));
    const isAtRisk = riskScore >= 70;

    return {
      relayerKey,
      totalAttestations,
      doubleSignCount,
      riskScore,
      recentEvents: relevantEvents.slice(-10),
      isAtRisk,
    };
  }

  /**
   * Return all recorded double-sign events.
   */
  getDoubleSignEvents(): DoubleSignEvent[] {
    return [...this.doubleSignEvents];
  }

  /**
   * Clear all recorded attestations and double-sign events.
   */
  reset(): void {
    this.attestations.clear();
    this.doubleSignEvents.length = 0;
  }
}
