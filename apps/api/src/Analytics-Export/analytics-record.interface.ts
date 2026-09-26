import { AnalyticsMetric } from './analytics-metric.enum';

export interface AnalyticsRecord {
  id: string;
  metric: AnalyticsMetric;
  value: number;
  unit: string;
  metadata: Record<string, unknown>;
  networkId?: string;
  userId?: string;
  timestamp: Date;
  createdAt: Date;
}

export interface GasPriceRecord extends AnalyticsRecord {
  metric: AnalyticsMetric.GAS_PRICE;
  metadata: {
    baseFee: number;
    priorityFee: number;
    gasLimit: number;
    blockNumber: number;
    networkName: string;
  };
}

export interface AlertRecord extends AnalyticsRecord {
  metric: AnalyticsMetric.ALERT_TRIGGERED;
  metadata: {
    alertId: string;
    alertName: string;
    thresholdValue: number;
    actualValue: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface FeeRecommendationRecord extends AnalyticsRecord {
  metric: AnalyticsMetric.FEE_RECOMMENDATION;
  metadata: {
    recommendedFee: number;
    confidence: number;
    strategy: 'economy' | 'standard' | 'fast';
    estimatedConfirmationTime: number;
  };
}

export interface VolatilityRecord extends AnalyticsRecord {
  metric: AnalyticsMetric.VOLATILITY_INDEX;
  metadata: {
    stdDev: number;
    percentileRank: number;
    windowMinutes: number;
    trend: 'rising' | 'falling' | 'stable';
  };
}
