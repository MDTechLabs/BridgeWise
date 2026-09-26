/**
 * packages/analyzers/src/optimistic/challenge-monitor.ts
 *
 * Optimistic Challenge Window Expiry Monitor
 * -------------------------------------------
 * In an optimistic bridge, a relayer submits an asserted state root for the
 * destination chain to trust; it becomes permanent and executable once its
 * fraud-proof dispute window elapses without a successful challenge.
 *
 * This monitor indexes proposed state root assertions, validates each one
 * against the true canonical state root on the source chain, and — for any
 * assertion found to be invalid — tracks its dispute window so a
 * high-priority alert can fire while there's still time left to submit a
 * fraud proof (by default, once 20% or less of the window remains).
 *
 * The monitor doesn't know how to fetch canonical state itself (that's
 * chain-specific); it's driven by a caller-supplied `resolveCanonicalStateRoot`
 * function so it works against Stellar/Soroban, EVM, or any other source
 * chain the same way.
 */

import { EventEmitter } from 'events';

/** A state root assertion submitted to a destination optimistic bridge contract. */
export interface StateRootAssertion {
  /** Destination chain the assertion was submitted to. */
  chainId: number;
  assertionId: string;
  proposer: string;
  claimedStateRoot: string;
  submittedAtBlock: number;
  submittedAtTimestamp: number;
  /** Total dispute/challenge window duration, in seconds, from submission. */
  challengeWindowSeconds: number;
}

/** Resolves the true canonical state root on the source chain, for comparison. */
export type CanonicalStateRootResolver = (
  assertion: StateRootAssertion,
) => string | Promise<string>;

/** High-priority alert for an invalid assertion nearing the end of its dispute window. */
export interface ChallengeAlert {
  assertionId: string;
  chainId: number;
  proposer: string;
  claimedStateRoot: string;
  canonicalStateRoot: string;
  /** Exact time remaining before the challenge window closes, in seconds. */
  remainingSeconds: number;
  /** Exact time remaining before the challenge window closes, in destination-chain blocks. */
  remainingBlocks: number;
  /** Fraction of the total window still remaining, 0-1. */
  remainingFraction: number;
  windowExpiresAtTimestamp: number;
  detectedAt: number;
}

/** An invalid assertion's dispute window closed with no fraud proof submitted. */
export interface ChallengeExpiredEvent {
  assertionId: string;
  chainId: number;
  claimedStateRoot: string;
  canonicalStateRoot: string;
  windowExpiresAtTimestamp: number;
  detectedAt: number;
}

export interface ChallengeMonitorOptions {
  /** Resolves the true canonical state root for a source chain, to validate an assertion against. */
  resolveCanonicalStateRoot: CanonicalStateRootResolver;
  /**
   * Alert once an invalid assertion's dispute window has this fraction of its
   * total duration or less remaining. Default 0.2 (20%).
   */
  alertRemainingFraction?: number;
  /** Average seconds per block on the destination chain, used to express remaining time in blocks. Default 12. */
  averageBlockTimeSeconds?: number;
  /** Clock override for tests. Returns the current unix timestamp, in seconds. */
  now?: () => number;
}

interface TrackedAssertion {
  assertion: StateRootAssertion;
  canonicalStateRoot: string;
  windowExpiresAtTimestamp: number;
  alerted: boolean;
}

/**
 * Declaration merging: gives `.on()` / `.once()` / `.emit()` typed payloads
 * instead of the default EventEmitter signature.
 */
export declare interface ChallengeMonitor {
  on(event: 'validated', listener: (assertion: StateRootAssertion) => void): this;
  on(
    event: 'invalidAssertionDetected',
    listener: (assertion: StateRootAssertion, canonicalStateRoot: string) => void,
  ): this;
  on(event: 'alert', listener: (alert: ChallengeAlert) => void): this;
  on(event: 'expired', listener: (event: ChallengeExpiredEvent) => void): this;
  emit(event: 'validated', assertion: StateRootAssertion): boolean;
  emit(event: 'invalidAssertionDetected', assertion: StateRootAssertion, canonicalStateRoot: string): boolean;
  emit(event: 'alert', alert: ChallengeAlert): boolean;
  emit(event: 'expired', payload: ChallengeExpiredEvent): boolean;
}

export class ChallengeMonitor extends EventEmitter {
  private readonly resolveCanonicalStateRoot: CanonicalStateRootResolver;
  private readonly alertRemainingFraction: number;
  private readonly averageBlockTimeSeconds: number;
  private readonly now: () => number;

  /** Invalid assertions currently being watched, keyed by assertionId. */
  private readonly tracked = new Map<string, TrackedAssertion>();

  constructor(options: ChallengeMonitorOptions) {
    super();
    this.resolveCanonicalStateRoot = options.resolveCanonicalStateRoot;
    this.alertRemainingFraction = options.alertRemainingFraction ?? 0.2;
    this.averageBlockTimeSeconds = options.averageBlockTimeSeconds ?? 12;
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
  }

  /** Number of invalid assertions currently being watched for their dispute window closing. */
  get pendingCount(): number {
    return this.tracked.size;
  }

  /**
   * Index a newly observed state root assertion and validate it against the
   * source chain's canonical state. If it's invalid, starts tracking its
   * dispute window and immediately checks whether it already warrants an
   * alert (e.g. if this assertion was only just discovered late).
   */
  async trackAssertion(assertion: StateRootAssertion): Promise<void> {
    const canonicalStateRoot = await this.resolveCanonicalStateRoot(assertion);

    if (canonicalStateRoot === assertion.claimedStateRoot) {
      this.emit('validated', assertion);
      return;
    }

    this.emit('invalidAssertionDetected', assertion, canonicalStateRoot);

    const windowExpiresAtTimestamp =
      assertion.submittedAtTimestamp + assertion.challengeWindowSeconds;

    this.tracked.set(assertion.assertionId, {
      assertion,
      canonicalStateRoot,
      windowExpiresAtTimestamp,
      alerted: false,
    });

    this.evaluateAssertion(assertion.assertionId);
  }

  /** Stop watching an assertion (e.g. once a fraud proof has been submitted for it). */
  untrackAssertion(assertionId: string): void {
    this.tracked.delete(assertionId);
  }

  /**
   * Re-evaluate every currently tracked (invalid) assertion against the
   * current time, firing `alert` once for each assertion that crosses into
   * the alert threshold, and `expired` for any whose window has fully
   * closed. Call this on a schedule (e.g. every block or every few seconds).
   */
  checkPendingAssertions(): void {
    for (const assertionId of [...this.tracked.keys()]) {
      this.evaluateAssertion(assertionId);
    }
  }

  private evaluateAssertion(assertionId: string): void {
    const entry = this.tracked.get(assertionId);
    if (!entry) return;

    const nowSeconds = this.now();
    const remainingSeconds = entry.windowExpiresAtTimestamp - nowSeconds;

    if (remainingSeconds <= 0) {
      this.tracked.delete(assertionId);
      this.emit('expired', {
        assertionId,
        chainId: entry.assertion.chainId,
        claimedStateRoot: entry.assertion.claimedStateRoot,
        canonicalStateRoot: entry.canonicalStateRoot,
        windowExpiresAtTimestamp: entry.windowExpiresAtTimestamp,
        detectedAt: nowSeconds,
      });
      return;
    }

    const remainingFraction = remainingSeconds / entry.assertion.challengeWindowSeconds;

    if (!entry.alerted && remainingFraction <= this.alertRemainingFraction) {
      entry.alerted = true;
      this.emit('alert', {
        assertionId,
        chainId: entry.assertion.chainId,
        proposer: entry.assertion.proposer,
        claimedStateRoot: entry.assertion.claimedStateRoot,
        canonicalStateRoot: entry.canonicalStateRoot,
        remainingSeconds,
        remainingBlocks: Math.ceil(remainingSeconds / this.averageBlockTimeSeconds),
        remainingFraction,
        windowExpiresAtTimestamp: entry.windowExpiresAtTimestamp,
        detectedAt: nowSeconds,
      });
    }
  }
}
