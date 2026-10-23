import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { paginate, PaginatedResult } from '../../common/pagination';
import {
  ACTIVE_STATUSES,
  ACTOR_PATTERN,
  ALLOWED_TRANSITIONS,
  BLOCKING_SEVERITY,
  MAX_FLAGS,
  MAX_NOTE_LENGTH,
  SEVERITY_RANK,
  STATUSES_REQUIRING_NOTE,
  SUBJECT_ID_PATTERN,
} from './review-flag.constants';
import {
  FLAG_REASONS,
  FLAG_SEVERITIES,
  FLAG_STATUSES,
  FlagReason,
  FlagSeverity,
  FlagSource,
  FlagStatus,
  FlagSubjectType,
  ReviewFlag,
  ReviewFlagFilter,
  SUBJECT_TYPES,
} from './review-flag.types';

export interface RaiseFlagInput {
  subjectType: FlagSubjectType;
  subjectId: string;
  reason: FlagReason;
  severity: FlagSeverity;
  note?: string;
  source?: FlagSource;
  createdBy: string;
}

@Injectable()
export class ReviewFlagService {
  private readonly flags = new Map<string, ReviewFlag>();

  /**
   * Raise a review flag. If an active flag with the same subject and reason
   * already exists, that flag is returned (raised to the higher severity if
   * needed) instead of creating a duplicate.
   */
  raise(input: RaiseFlagInput): { flag: ReviewFlag; created: boolean } {
    this.assertOneOf(input.subjectType, SUBJECT_TYPES, 'subjectType');
    this.assertOneOf(input.reason, FLAG_REASONS, 'reason');
    this.assertOneOf(input.severity, FLAG_SEVERITIES, 'severity');
    const subjectId = this.validateSubjectId(input.subjectId);
    const actor = this.validateActor(input.createdBy);
    const note = this.validateNote(input.note);

    const existing = this.findActive(input.subjectType, subjectId, input.reason);
    if (existing) {
      if (SEVERITY_RANK[input.severity] > SEVERITY_RANK[existing.severity]) {
        existing.severity = input.severity;
        existing.updatedAt = new Date().toISOString();
      }
      return { flag: this.copy(existing), created: false };
    }

    if (this.flags.size >= MAX_FLAGS) {
      throw new ServiceUnavailableException('Compliance flag store is full');
    }

    const now = new Date().toISOString();
    const flag: ReviewFlag = {
      id: randomUUID(),
      subjectType: input.subjectType,
      subjectId,
      reason: input.reason,
      severity: input.severity,
      status: 'open',
      source: input.source ?? 'manual',
      note,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
      history: [{ from: null, to: 'open', actor, note, at: now }],
    };
    this.flags.set(flag.id, flag);
    return { flag: this.copy(flag), created: true };
  }

  /** Move a flag through the review workflow, recording who and why. */
  transition(id: string, to: FlagStatus, actor: string, note?: string): ReviewFlag {
    this.assertOneOf(to, FLAG_STATUSES, 'status');
    const reviewer = this.validateActor(actor);
    const justification = this.validateNote(note);
    const flag = this.requireFlag(id);

    if (!ALLOWED_TRANSITIONS[flag.status].includes(to)) {
      throw new ConflictException(`Cannot move a flag from "${flag.status}" to "${to}"`);
    }
    if (STATUSES_REQUIRING_NOTE.includes(to) && !justification) {
      throw new BadRequestException(`A note is required when moving a flag to "${to}"`);
    }

    const at = new Date().toISOString();
    flag.history.push({ from: flag.status, to, actor: reviewer, note: justification, at });
    flag.status = to;
    flag.updatedAt = at;
    return this.copy(flag);
  }

  get(id: string): ReviewFlag {
    return this.copy(this.requireFlag(id));
  }

  /** Newest first, using the shared pagination standard. */
  list(
    filter: ReviewFlagFilter = {},
    pagination: { page?: number; limit?: number } = {},
  ): PaginatedResult<ReviewFlag> {
    const matches = [...this.flags.values()]
      .filter(
        (f) =>
          (!filter.subjectType || f.subjectType === filter.subjectType) &&
          (!filter.subjectId || f.subjectId === filter.subjectId) &&
          (!filter.reason || f.reason === filter.reason) &&
          (!filter.severity || f.severity === filter.severity) &&
          (!filter.status || f.status === filter.status),
      )
      .reverse();
    const page = paginate(matches, pagination);
    return { items: page.items.map((f) => this.copy(f)), pagination: page.pagination };
  }

  /** Flags on a subject that still need attention. */
  getActiveFlags(subjectType: FlagSubjectType, subjectId: string): ReviewFlag[] {
    const id = this.validateSubjectId(subjectId);
    return [...this.flags.values()]
      .filter((f) => f.subjectType === subjectType && f.subjectId === id && this.isActive(f))
      .map((f) => this.copy(f));
  }

  /**
   * True when the subject carries an active flag at or above the blocking
   * severity. Callers (e.g. execution) can use this to hold a transaction
   * pending review.
   */
  requiresReview(subjectType: FlagSubjectType, subjectId: string): boolean {
    return this.getActiveFlags(subjectType, subjectId).some(
      (f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[BLOCKING_SEVERITY],
    );
  }

  size(): number {
    return this.flags.size;
  }

  reset(): void {
    this.flags.clear();
  }

  private isActive(flag: ReviewFlag): boolean {
    return ACTIVE_STATUSES.includes(flag.status);
  }

  private findActive(type: FlagSubjectType, subjectId: string, reason: FlagReason) {
    for (const f of this.flags.values()) {
      if (f.subjectType === type && f.subjectId === subjectId && f.reason === reason && this.isActive(f)) {
        return f;
      }
    }
    return undefined;
  }

  private requireFlag(id: string): ReviewFlag {
    const flag = this.flags.get(String(id));
    if (!flag) throw new NotFoundException(`Review flag "${id}" not found`);
    return flag;
  }

  private copy(flag: ReviewFlag): ReviewFlag {
    return { ...flag, history: flag.history.map((h) => ({ ...h })) };
  }

  private assertOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): asserts value is T {
    if (!allowed.includes(value as T)) {
      throw new BadRequestException(`${field} must be one of: ${allowed.join(', ')}`);
    }
  }

  private validateSubjectId(subjectId: string): string {
    const id = String(subjectId ?? '').trim();
    if (!SUBJECT_ID_PATTERN.test(id)) throw new BadRequestException('Invalid subjectId');
    return id;
  }

  private validateActor(actor: string): string {
    const a = String(actor ?? '').trim();
    if (!ACTOR_PATTERN.test(a)) throw new BadRequestException('Invalid actor');
    return a;
  }

  private validateNote(note?: string): string | undefined {
    if (note === undefined || note === null) return undefined;
    const n = String(note).trim();
    if (n.length > MAX_NOTE_LENGTH) {
      throw new BadRequestException(`note must be at most ${MAX_NOTE_LENGTH} characters`);
    }
    return n || undefined;
  }
}
