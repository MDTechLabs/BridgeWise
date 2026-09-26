export type LifecycleStage =
  | 'initiated'
  | 'validated'
  | 'locked'
  | 'bridging'
  | 'confirming'
  | 'released'
  | 'completed'
  | 'failed';

export interface LifecycleEvent {
  transferId: string;
  stage: LifecycleStage;
  timestamp: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface TransferRecord {
  id: string;
  sourceChain: string;
  destinationChain: string;
  asset: string;
  amount: string;
  events: LifecycleEvent[];
  startedAt: number;
  completedAt?: number;
  failed?: boolean;
}

export interface StageDuration {
  stage: LifecycleStage;
  avgMs: number;
  minMs: number;
  maxMs: number;
  count: number;
}

export interface BottleneckReport {
  stage: LifecycleStage;
  avgMs: number;
  percentageOfTotal: number;
}

export interface AnalyticsReport {
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  avgTotalDurationMs: number;
  stageDurations: StageDuration[];
  bottlenecks: BottleneckReport[];
  generatedAt: number;
}
