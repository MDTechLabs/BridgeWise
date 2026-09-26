/**
 * Types for the Stellar Transfer Timeline Generator (#453).
 *
 * Builds a stage-by-stage timeline from a transfer lifecycle produced by the
 * Soroban transfer state machine (#535), recording entry and exit timestamps
 * plus per-stage durations so transfer progress can be surfaced to users.
 */
import type {
  RecoveryPathDefinition,
  TransferState,
} from '../../../transfers/state-machine/stellar';

/**
 * A single stage occupied by a transfer during its lifecycle.
 */
export interface TimelineStage {
  /** Lifecycle state this stage represents. */
  state: TransferState;
  /** Zero-based position of this stage in the timeline. */
  index: number;
  /** Epoch milliseconds at which the transfer entered this stage. */
  enteredAt: number;
  /** Epoch milliseconds at which the transfer left this stage, if it has. */
  exitedAt?: number;
  /** Milliseconds spent in this stage; still accruing while `isCurrent`. */
  durationMs: number;
  /** Reason recorded on the transition that entered this stage, if any. */
  reason?: string;
  /** True when this is the stage the transfer currently occupies. */
  isCurrent: boolean;
}

/**
 * A generated timeline view for a single transfer.
 */
export interface TransferTimeline {
  transferId: string;
  /** Stages in chronological order, oldest first. */
  stages: TimelineStage[];
  currentState: TransferState;
  /** Epoch milliseconds at which the transfer was created. */
  startedAt: number;
  /** Final transition time, or the observation time while still in flight. */
  endedAt: number;
  /** Total elapsed milliseconds between `startedAt` and `endedAt`. */
  totalDurationMs: number;
  /** True once the transfer reaches a terminal state. */
  isComplete: boolean;
  /** Recovery path recorded on the lifecycle, if one was triggered. */
  recoveryPath?: RecoveryPathDefinition;
}

/**
 * Construction options for {@link StellarTransferTimelineGenerator}.
 */
export interface TimelineGeneratorOptions {
  /** Clock override; defaults to `Date.now`. Injectable for deterministic tests. */
  now?: () => number;
}

/**
 * Formatting options for the textual timeline view.
 */
export interface TimelineRenderOptions {
  /** Include the reason recorded for each transition. Defaults to `true`. */
  includeReasons?: boolean;
  /** Include per-stage durations. Defaults to `true`. */
  includeDurations?: boolean;
}