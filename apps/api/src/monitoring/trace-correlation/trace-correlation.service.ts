import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  CHAIN_PATTERN,
  IDENTIFIER_PATTERN,
  MAX_ERROR_LENGTH,
  MAX_LINKS_PER_TRACE,
  MAX_STEP_NAME_LENGTH,
  MAX_STEPS_PER_TRACE,
  MAX_TRACES,
  TRACE_ID_PATTERN,
  TRACE_TTL_MS,
} from './trace-correlation.constants';
import {
  CorrelatedTrace,
  LINK_TYPES,
  TraceLink,
  TraceLinkType,
  TraceStatus,
  TraceStep,
  TraceStepStatus,
} from './trace-correlation.types';

interface TraceRecord {
  traceId: string;
  createdAt: number;
  updatedAt: number;
  links: TraceLink[];
  steps: TraceStep[];
}

const STEP_STATUSES: TraceStepStatus[] = ['started', 'succeeded', 'failed'];

/**
 * Correlates the identifiers that describe one transaction as it crosses
 * services and chains (request id, transaction id, quote id, per-chain tx
 * hashes) under a single trace id.
 */
@Injectable()
export class TraceCorrelationService {
  /** Insertion-ordered so the oldest trace can be evicted first. */
  private readonly traces = new Map<string, TraceRecord>();
  /** `${type}:${normalisedValue}` -> traceId */
  private readonly index = new Map<string, string>();

  /** Create the trace if it does not exist yet. Idempotent. */
  startTrace(traceId: string, requestId?: string): CorrelatedTrace {
    const id = this.validateTraceId(traceId);
    this.expire();
    if (!this.traces.has(id)) {
      if (this.traces.size >= MAX_TRACES) this.evictOldest();
      const now = Date.now();
      this.traces.set(id, { traceId: id, createdAt: now, updatedAt: now, links: [], steps: [] });
    }
    if (requestId) this.link(id, 'requestId', requestId);
    return this.toView(this.traces.get(id)!);
  }

  /**
   * Associate an identifier with a trace. Re-linking the same identifier to
   * the same trace is a no-op; linking it to a different trace is rejected so
   * an existing trace cannot be hijacked or merged by mistake.
   */
  link(traceId: string, type: TraceLinkType, value: string, chain?: string): void {
    const record = this.requireTrace(traceId);
    if (!LINK_TYPES.includes(type)) {
      throw new BadRequestException(`Unknown link type "${type}"`);
    }
    const normalised = this.normaliseValue(type, value);
    const chainId = this.validateChain(chain);
    const key = `${type}:${normalised}`;

    const owner = this.index.get(key);
    if (owner && owner !== record.traceId) {
      throw new ConflictException(`${type} "${normalised}" is already linked to another trace`);
    }
    if (owner) return;
    if (record.links.length >= MAX_LINKS_PER_TRACE) {
      throw new BadRequestException(`A trace cannot have more than ${MAX_LINKS_PER_TRACE} links`);
    }

    this.index.set(key, record.traceId);
    record.links.push({ type, value: normalised, chain: chainId, linkedAt: new Date().toISOString() });
    record.updatedAt = Date.now();
  }

  /** Append a step (a hop, RPC call, confirmation, ...) to the trace. */
  recordStep(
    traceId: string,
    step: {
      name: string;
      status: TraceStepStatus;
      chain?: string;
      durationMs?: number;
      error?: string;
    },
  ): void {
    const record = this.requireTrace(traceId);
    const name = String(step.name ?? '').trim();
    if (!name || name.length > MAX_STEP_NAME_LENGTH) {
      throw new BadRequestException(`Step name must be 1-${MAX_STEP_NAME_LENGTH} characters`);
    }
    if (!STEP_STATUSES.includes(step.status)) {
      throw new BadRequestException(`Invalid step status "${step.status}"`);
    }
    if (step.durationMs !== undefined && (!Number.isFinite(step.durationMs) || step.durationMs < 0)) {
      throw new BadRequestException('durationMs must be a non-negative finite number');
    }
    if (record.steps.length >= MAX_STEPS_PER_TRACE) {
      throw new BadRequestException(`A trace cannot have more than ${MAX_STEPS_PER_TRACE} steps`);
    }

    record.steps.push({
      name,
      status: step.status,
      chain: this.validateChain(step.chain),
      durationMs: step.durationMs,
      error: step.error?.slice(0, MAX_ERROR_LENGTH),
      recordedAt: new Date().toISOString(),
    });
    record.updatedAt = Date.now();
  }

  /**
   * Resolve any identifier - a trace id or a linked request/transaction/quote
   * id or tx hash - to its trace id. Returns undefined when unknown.
   */
  resolve(identifier: string): string | undefined {
    const id = this.validateIdentifier(identifier);
    this.expire();
    if (this.traces.has(id)) return id;
    if (this.traces.has(id.toLowerCase())) return id.toLowerCase();

    const matches = new Set<string>();
    for (const type of LINK_TYPES) {
      const owner = this.index.get(`${type}:${this.normaliseValue(type, id)}`);
      if (owner) matches.add(owner);
    }
    // An identifier shared by several traces is ambiguous; refuse to guess.
    return matches.size === 1 ? [...matches][0] : undefined;
  }

  getTrace(identifier: string): CorrelatedTrace | undefined {
    const traceId = this.resolve(identifier);
    const record = traceId ? this.traces.get(traceId) : undefined;
    return record ? this.toView(record) : undefined;
  }

  size(): number {
    return this.traces.size;
  }

  reset(): void {
    this.traces.clear();
    this.index.clear();
  }

  private toView(record: TraceRecord): CorrelatedTrace {
    const chains = new Set<string>();
    record.links.forEach((l) => l.chain && chains.add(l.chain));
    record.steps.forEach((s) => s.chain && chains.add(s.chain));
    return {
      traceId: record.traceId,
      status: this.deriveStatus(record.steps),
      createdAt: new Date(record.createdAt).toISOString(),
      updatedAt: new Date(record.updatedAt).toISOString(),
      chains: [...chains].sort(),
      links: record.links.map((l) => ({ ...l })),
      steps: record.steps.map((s) => ({ ...s })),
    };
  }

  /** Status is based on the latest status of each (step, chain) pair. */
  private deriveStatus(steps: TraceStep[]): TraceStatus {
    if (steps.length === 0) return 'in_progress';
    const latest = new Map<string, TraceStepStatus>();
    for (const s of steps) latest.set(`${s.name}@${s.chain ?? ''}`, s.status);
    const statuses = [...latest.values()];
    if (statuses.includes('failed')) return 'failed';
    return statuses.every((s) => s === 'succeeded') ? 'completed' : 'in_progress';
  }

  private requireTrace(traceId: string): TraceRecord {
    const id = this.validateTraceId(traceId);
    const record = this.traces.get(id);
    if (!record) throw new BadRequestException(`Trace "${id}" has not been started`);
    return record;
  }

  private validateTraceId(traceId: string): string {
    const id = String(traceId ?? '').trim().toLowerCase();
    if (!TRACE_ID_PATTERN.test(id)) throw new BadRequestException('Invalid trace id');
    return id;
  }

  private validateIdentifier(identifier: string): string {
    const id = String(identifier ?? '').trim();
    if (!IDENTIFIER_PATTERN.test(id)) throw new BadRequestException('Invalid identifier');
    return id;
  }

  private validateChain(chain?: string): string | undefined {
    if (chain === undefined) return undefined;
    const id = chain.trim().toLowerCase();
    if (!CHAIN_PATTERN.test(id)) throw new BadRequestException(`Invalid chain identifier "${chain}"`);
    return id;
  }

  /** Hashes are case-insensitive; other identifiers are matched exactly. */
  private normaliseValue(type: TraceLinkType, value: string): string {
    const v = this.validateIdentifier(value);
    return type === 'txHash' ? v.toLowerCase() : v;
  }

  private evictOldest(): void {
    const oldest = this.traces.keys().next().value as string | undefined;
    if (oldest !== undefined) this.remove(oldest);
  }

  private expire(now: number = Date.now()): void {
    for (const [id, record] of this.traces) {
      // Map is insertion-ordered by creation, so stop at the first live trace.
      if (now - record.createdAt <= TRACE_TTL_MS) break;
      this.remove(id);
    }
  }

  private remove(traceId: string): void {
    const record = this.traces.get(traceId);
    if (!record) return;
    record.links.forEach((l) => this.index.delete(`${l.type}:${l.value}`));
    this.traces.delete(traceId);
  }
}
