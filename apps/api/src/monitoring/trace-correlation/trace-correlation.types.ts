export const LINK_TYPES = [
  'requestId',
  'transactionId',
  'transferId',
  'quoteId',
  'txHash',
] as const;

export type TraceLinkType = (typeof LINK_TYPES)[number];

export type TraceStepStatus = 'started' | 'succeeded' | 'failed';
export type TraceStatus = 'in_progress' | 'completed' | 'failed';

export interface TraceLink {
  type: TraceLinkType;
  value: string;
  chain?: string;
  linkedAt: string;
}

export interface TraceStep {
  name: string;
  status: TraceStepStatus;
  chain?: string;
  durationMs?: number;
  error?: string;
  recordedAt: string;
}

export interface CorrelatedTrace {
  traceId: string;
  status: TraceStatus;
  createdAt: string;
  updatedAt: string;
  chains: string[];
  links: TraceLink[];
  steps: TraceStep[];
}
