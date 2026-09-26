import type {
  TransferLifecycle,
  TransferState,
} from '../../../transfers/state-machine/stellar';
import type {
  TimelineGeneratorOptions,
  TimelineRenderOptions,
  TimelineStage,
  TransferTimeline,
} from './types';

/**
 * States in which a transfer has concluded.
 *
 * Mirrored from the transfer state machine (#535), which keeps its own
 * TERMINAL_STATES module-private. FAILED is deliberately absent: a failed
 * transfer may still advance to RECOVERING or REFUNDED, so it is not terminal.
 */
const TERMINAL_STATES: readonly TransferState[] = ['COMPLETED', 'REFUNDED'];

const SEPARATOR_WIDTH = 56;
const STATE_COLUMN_WIDTH = 16;

/**
 * Formats a millisecond duration into a compact human-readable string.
 */
function formatDuration(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  if (safe < 1000) {
    return `${safe}ms`;
  }
  const seconds = safe / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${Math.round(seconds % 60)}s`;
  }
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

/**
 * Stellar Transfer Timeline Generator (#453).
 *
 * Derives a stage-by-stage timeline from a TransferLifecycle produced by the
 * Soroban transfer state machine (#535). Consumers pass the lifecycle snapshot
 * directly:
 *
 *   const generator = new StellarTransferTimelineGenerator();
 *   const timeline = generator.generate(machine.state);
 *   console.log(generator.render(timeline));
 *
 * The generator is a pure function of its input and holds no transfer state of
 * its own, so a single instance may be shared across transfers.
 */
export class StellarTransferTimelineGenerator {
  private readonly now: () => number;

  constructor(options: TimelineGeneratorOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Builds a timeline from a transfer lifecycle snapshot.
   *
   * Stage boundaries are derived from consecutive transition timestamps, with
   * `createdAt` anchoring the first stage. Durations are clamped at zero so
   * out-of-order timestamps cannot produce negative values.
   */
  generate(lifecycle: TransferLifecycle): TransferTimeline {
    if (!lifecycle.transferId) {
      throw new Error('Cannot generate a timeline without a transferId');
    }

    const events = [...lifecycle.events].sort((a, b) => a.timestamp - b.timestamp);
    const isComplete = TERMINAL_STATES.includes(lifecycle.currentState);
    const observedAt = this.now();

    const stages: TimelineStage[] = [
      {
        state: events.length > 0 ? events[0].from : lifecycle.currentState,
        index: 0,
        enteredAt: lifecycle.createdAt,
        durationMs: 0,
        isCurrent: false,
      },
    ];

    for (const event of events) {
      stages.push({
        state: event.to,
        index: stages.length,
        enteredAt: event.timestamp,
        durationMs: 0,
        isCurrent: false,
        ...(event.reason !== undefined ? { reason: event.reason } : {}),
      });
    }

    for (let i = 0; i < stages.length - 1; i += 1) {
      const stage = stages[i];
      const exitedAt = stages[i + 1].enteredAt;
      stage.exitedAt = exitedAt;
      stage.durationMs = Math.max(0, exitedAt - stage.enteredAt);
    }

    const finalStage = stages[stages.length - 1];
    finalStage.isCurrent = true;
    if (isComplete) {
      finalStage.exitedAt = finalStage.enteredAt;
      finalStage.durationMs = 0;
    } else {
      finalStage.durationMs = Math.max(0, observedAt - finalStage.enteredAt);
    }

    const endedAt = isComplete ? finalStage.enteredAt : observedAt;

    return {
      transferId: lifecycle.transferId,
      stages,
      currentState: lifecycle.currentState,
      startedAt: lifecycle.createdAt,
      endedAt,
      totalDurationMs: Math.max(0, endedAt - lifecycle.createdAt),
      isComplete,
      ...(lifecycle.recoveryPath !== undefined
        ? { recoveryPath: lifecycle.recoveryPath }
        : {}),
    };
  }

  /**
   * Renders a timeline as plain text for logs, CLI output, or support tooling.
   *
   * The current stage of an in-flight transfer is marked with `>`; concluded
   * stages are marked with `*`.
   */
  render(timeline: TransferTimeline, options: TimelineRenderOptions = {}): string {
    const includeReasons = options.includeReasons ?? true;
    const includeDurations = options.includeDurations ?? true;

    const lines: string[] = [
      `Transfer ${timeline.transferId} - ${timeline.currentState} (${
        timeline.isComplete ? 'complete' : 'in progress'
      })`,
      `Elapsed ${formatDuration(timeline.totalDurationMs)} across ${
        timeline.stages.length
      } stage(s)`,
      '-'.repeat(SEPARATOR_WIDTH),
    ];

    for (const stage of timeline.stages) {
      const isActive = stage.isCurrent && !timeline.isComplete;
      const offset = formatDuration(stage.enteredAt - timeline.startedAt);
      let line = `${isActive ? '>' : '*'} [${stage.index}] ${stage.state.padEnd(
        STATE_COLUMN_WIDTH,
      )} +${offset}`;

      if (includeDurations) {
        line += isActive
          ? `  (${formatDuration(stage.durationMs)} so far)`
          : `  (${formatDuration(stage.durationMs)})`;
      }
      if (includeReasons && stage.reason !== undefined) {
        line += `  ${stage.reason}`;
      }
      lines.push(line);
    }

    if (timeline.recoveryPath !== undefined) {
      lines.push('-'.repeat(SEPARATOR_WIDTH));
      lines.push(
        `Recovery: ${timeline.recoveryPath.path} - ${timeline.recoveryPath.description}`,
      );
    }

    return lines.join('\n');
  }
}