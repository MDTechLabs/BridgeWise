export const SUBJECT_TYPES = ['transaction', 'transfer', 'account', 'quote'] as const;
export type FlagSubjectType = (typeof SUBJECT_TYPES)[number];

export const FLAG_REASONS = [
  'sanctions_screening',
  'high_value',
  'suspicious_pattern',
  'jurisdiction_risk',
  'manual_review',
  'other',
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export const FLAG_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type FlagSeverity = (typeof FLAG_SEVERITIES)[number];

export const FLAG_STATUSES = ['open', 'under_review', 'escalated', 'cleared'] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];

export type FlagSource = 'system' | 'manual';

export interface FlagHistoryEntry {
  from: FlagStatus | null;
  to: FlagStatus;
  actor: string;
  note?: string;
  at: string;
}

export interface ReviewFlag {
  id: string;
  subjectType: FlagSubjectType;
  subjectId: string;
  reason: FlagReason;
  severity: FlagSeverity;
  status: FlagStatus;
  source: FlagSource;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  history: FlagHistoryEntry[];
}

export interface ReviewFlagFilter {
  subjectType?: FlagSubjectType;
  subjectId?: string;
  reason?: FlagReason;
  severity?: FlagSeverity;
  status?: FlagStatus;
}
