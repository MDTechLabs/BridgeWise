import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import {
  EmitProgressOptions,
  ExecutionProgressEvent,
  ExecutionState,
  TERMINAL_STATES,
} from './execution-progress.types';

/**
 * Emits real-time bridge execution lifecycle events and lets consumers
 * (WebSocket gateways, SSE endpoints, in-process listeners) subscribe to the
 * progress of a specific execution or of all executions.
 */
@Injectable()
export class ExecutionProgressStreamService {
  private readonly logger = new Logger(ExecutionProgressStreamService.name);

  private readonly subject = new Subject<ExecutionProgressEvent>();
  private readonly snapshots = new Map<string, ExecutionProgressEvent>();
  private readonly sequences = new Map<string, number>();

  /**
   * Emit a lifecycle update. Returns the emitted event, or null if the
   * execution has already reached a terminal state (no further updates allowed).
   */
  emit(
    executionId: string,
    state: ExecutionState,
    options: EmitProgressOptions = {},
  ): ExecutionProgressEvent | null {
    const previous = this.snapshots.get(executionId);
    if (previous && TERMINAL_STATES.has(previous.state)) {
      this.logger.warn(
        `Ignoring ${state} for ${executionId}; already terminal (${previous.state}).`,
      );
      return null;
    }

    const sequence = (this.sequences.get(executionId) ?? 0) + 1;
    this.sequences.set(executionId, sequence);

    const event: ExecutionProgressEvent = {
      executionId,
      state,
      transactionId: options.transactionId ?? previous?.transactionId,
      message: options.message,
      sequence,
      timestamp: new Date().toISOString(),
    };

    this.snapshots.set(executionId, event);
    this.subject.next(event);
    return event;
  }

  /** Observable of every execution's progress events. */
  stream(): Observable<ExecutionProgressEvent> {
    return this.subject.asObservable();
  }

  /** Observable scoped to a single execution. */
  streamFor(executionId: string): Observable<ExecutionProgressEvent> {
    return this.subject.asObservable().pipe(filter((e) => e.executionId === executionId));
  }

  /** Latest known event for an execution, if any. */
  getSnapshot(executionId: string): ExecutionProgressEvent | undefined {
    return this.snapshots.get(executionId);
  }

  isTerminal(executionId: string): boolean {
    const snap = this.snapshots.get(executionId);
    return !!snap && TERMINAL_STATES.has(snap.state);
  }

  /** Release retained state for a completed execution. */
  clear(executionId: string): void {
    this.snapshots.delete(executionId);
    this.sequences.delete(executionId);
  }
}
