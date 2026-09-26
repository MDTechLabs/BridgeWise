import { SorobanInvocationReport } from '../../observability/soroban';

export interface ContractAggregatedMetrics {
  totalContracts: number;
  totalInvocations: number;
  successfulInvocations: number;
  failedInvocations: number;
  globalSuccessRate: number;
  averageLatencyMs: number;
  reports: SorobanInvocationReport[];
  lastUpdated: string;
}
