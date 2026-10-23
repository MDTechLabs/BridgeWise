import { FlagSeverity, FlagStatus } from './review-flag.types';

/** Allowed reviewer transitions. `cleared` is terminal: a recurrence raises a new flag. */
export const ALLOWED_TRANSITIONS: Record<FlagStatus, readonly FlagStatus[]> = {
  open: ['under_review', 'escalated', 'cleared'],
  under_review: ['escalated', 'cleared'],
  escalated: ['under_review', 'cleared'],
  cleared: [],
};

/** Moving to these statuses is a decision and must carry a justification. */
export const STATUSES_REQUIRING_NOTE: readonly FlagStatus[] = ['escalated', 'cleared'];

/** Statuses that still need attention. */
export const ACTIVE_STATUSES: readonly FlagStatus[] = ['open', 'under_review', 'escalated'];

export const SEVERITY_RANK: Record<FlagSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Severity at or above which an active flag marks its subject as blocked. */
export const BLOCKING_SEVERITY: FlagSeverity = 'high';

export const SUBJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;
export const ACTOR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9@:_.-]{0,63}$/;
export const MAX_NOTE_LENGTH = 1000;

/**
 * Compliance records are never silently evicted; once full, new flags are
 * refused so the condition is visible rather than losing history.
 */
export const MAX_FLAGS = 50_000;
