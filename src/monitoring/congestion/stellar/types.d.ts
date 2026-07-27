export interface CongestionMetrics {
    routeId: string;
    timestamp: Date;
    latencyMs: number;
    failureRate: number;
    queueDepth: number;
    throughput: number;
    pendingTransactions: number;
}
export interface CongestionAlert {
    routeId: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    metric: 'latency' | 'failureRate' | 'queueDepth' | 'throughput' | 'pendingTransactions';
    currentValue: number;
    threshold: number;
    message: string;
    timestamp: Date;
    resolvedAt?: Date;
}
export interface CongestionStatus {
    routeId: string;
    status: 'normal' | 'elevated' | 'congested' | 'severe';
    currentMetrics: CongestionMetrics;
    alertHistory: CongestionAlert[];
    lastUpdated: Date;
}
export interface CongestionThresholds {
    latencyMs?: number;
    failureRate?: number;
    queueDepth?: number;
    throughput?: number;
    pendingTransactions?: number;
}
export interface StellarCongestionMonitorConfig {
    checkIntervalMs?: number;
    timeoutMs?: number;
    historyWindowSize?: number;
    spikeMultiplier?: number;
    minDataPoints?: number;
    thresholds?: CongestionThresholds;
    onAlert?: (alert: CongestionAlert) => void;
    onStatusChange?: (status: CongestionStatus) => void;
    onError?: (error: unknown) => void;
}
export interface CongestionProbeResult {
    latencyMs: number;
    failureRate: number;
    queueDepth: number;
    throughput: number;
    pendingTransactions: number;
}
export type CongestionProbe = () => Promise<CongestionProbeResult>;
