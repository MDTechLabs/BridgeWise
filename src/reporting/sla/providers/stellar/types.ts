export interface SlaProviderConfig {
  providerId: string;
  uptimeSlaPercent: number;
  maxResponseTimeMs: number;
  minReliability: number;
}

export interface SlaDataPoint {
  timestamp: Date;
  providerId: string;
  available: boolean;
  responseTimeMs: number;
}

export interface SlaComplianceMetrics {
  providerId: string;
  periodStart: Date;
  periodEnd: Date;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  measuredUptimePercent: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  reliability: number;
  slaUptimeMet: boolean;
  slaResponseTimeMet: boolean;
  slaReliabilityMet: boolean;
  overallCompliant: boolean;
}

export interface SlaComplianceReport {
  reportId: string;
  generatedAt: Date;
  providers: SlaComplianceMetrics[];
  compliantProviders: string[];
  nonCompliantProviders: string[];
  summary: string;
}
