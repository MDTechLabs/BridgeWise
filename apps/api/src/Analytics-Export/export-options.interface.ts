import { AnalyticsMetric } from './analytics-metric.enum';

export interface ExportOptions {
  metrics: AnalyticsMetric[];
  startDate: Date;
  endDate: Date;
  networkId?: string;
  userId?: string;
  includeMetadata: boolean;
  delimiter: ',' | ';' | '\t';
  dateFormat: 'iso' | 'unix' | 'locale';
  timezone: string;
  limit?: number;
}

export interface CsvColumn {
  key: string;
  header: string;
  formatter?: (value: unknown, record?: unknown) => string;
}

export interface CsvBuildOptions {
  columns: CsvColumn[];
  delimiter: string;
  includeHeader: boolean;
  nullPlaceholder: string;
}

export interface ExportJobPayload {
  jobId: string;
  userId: string;
  options: ExportOptions;
  requestedAt: string;
}

export interface ExportJobResult {
  jobId: string;
  rowCount: number;
  fileSizeBytes: number;
  completedAt: string;
  downloadUrl?: string;
}
