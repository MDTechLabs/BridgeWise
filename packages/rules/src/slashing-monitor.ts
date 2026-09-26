/**
 * Slashing monitor for cross-chain relayer nodes.
 *
 * Provides pre-signing verification middleware and real-time monitoring of
 * relayer attestation activity. Emits events when double-sign conditions
 * are detected or when a relayer's risk score exceeds the configured threshold.
 *
 * @example
 * ```ts
 * const monitor = new SlashingMonitor(checker);
 * monitor.on('double-sign', (event) => {
 *   console.error('Double-sign detected!', event);
 * });
 * const result = monitor.verifyBeforeSign(proposedAttestation);
 * if (result.verdict === 'block') {
 *   console.warn(result.reason);
 * }
 * ```
 */

import { EventEmitter } from "events";
import {
  AttestationRecord,
  DoubleSignEvent,
  PreSignResult,
  SlashingMonitorOptions,
  SlashingRiskReport,
} from "./types";
import { DoubleSignChecker } from "./double-sign-checker";

const DEFAULT_OPTIONS: Required<SlashingMonitorOptions> = {
  maxHistorySize: 1000,
  riskThreshold: 70,
  checkWindowMs: 3_600_000,
};

/**
 * Events emitted by the SlashingMonitor.
 */
export interface SlashingMonitorEvents {
  "double-sign": (event: DoubleSignEvent) => void;
  "attestation-blocked": (result: PreSignResult) => void;
  "risk-alert": (report: SlashingRiskReport) => void;
}

/**
 * High-level monitor that wraps DoubleSignChecker with EventEmitter-based
 * alerting and periodic risk assessment.
 */
export class SlashingMonitor extends EventEmitter {
  private readonly checker: DoubleSignChecker;
  private readonly options: Required<SlashingMonitorOptions>;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private monitoredRelayers: Set<string> = new Set();

  constructor(checker: DoubleSignChecker, options: SlashingMonitorOptions = {}) {
    super();
    this.checker = checker;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Register a relayer key to be monitored.
   */
  addRelayer(relayerKey: string): void {
    this.monitoredRelayers.add(relayerKey);
  }

  /**
   * Remove a relayer key from monitoring.
   */
  removeRelayer(relayerKey: string): void {
    this.monitoredRelayers.delete(relayerKey);
  }

  /**
   * Pre-sign verification middleware. Checks whether a proposed attestation
   * would conflict with existing history and blocks it if so.
   *
   * Emits `'attestation-blocked'` when a conflicting attestation is blocked.
   */
  verifyBeforeSign(proposed: AttestationRecord): PreSignResult {
    const result = this.checker.checkForConflict(
      proposed.messageRoot,
      proposed.sequenceNumber,
      proposed.blockHeight,
      proposed.relayerKey,
    );

    if (result.verdict === "block") {
      this.emit("attestation-blocked", result);
    }

    return result;
  }

  /**
   * Record an attestation and emit `'double-sign'` if a conflict is detected.
   * Then assess risk for the relayer and emit `'risk-alert'` if threshold exceeded.
   */
  recordAttestation(attestation: AttestationRecord): void {
    const doubleSignEvent = this.checker.recordAttestation(attestation);

    if (doubleSignEvent) {
      this.emit("double-sign", doubleSignEvent);
    }

    this.monitoredRelayers.add(attestation.relayerKey);
    this.assessRisk(attestation.relayerKey);
  }

  /**
   * Get a slashing risk report for a relayer.
   */
  getRiskReport(relayerKey: string): SlashingRiskReport {
    return this.checker.getRiskReport(relayerKey);
  }

  /**
   * Start periodic risk assessment for all monitored relayers.
   */
  startMonitoring(intervalMs: number = 60_000): void {
    if (this.monitorTimer) {
      return;
    }

    this.monitorTimer = setInterval(() => {
      for (const relayerKey of this.monitoredRelayers) {
        this.assessRisk(relayerKey);
      }
    }, intervalMs);
  }

  /**
   * Stop periodic monitoring.
   */
  stopMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /**
   * Reset all checker state, clear monitored relayers, stop monitoring.
   */
  reset(): void {
    this.stopMonitoring();
    this.checker.reset();
    this.monitoredRelayers.clear();
    this.removeAllListeners();
  }

  /**
   * Assess risk for a relayer and emit `'risk-alert'` if threshold exceeded.
   */
  private assessRisk(relayerKey: string): void {
    const report = this.checker.getRiskReport(relayerKey);
    if (report.isAtRisk) {
      this.emit("risk-alert", report);
    }
  }
}
