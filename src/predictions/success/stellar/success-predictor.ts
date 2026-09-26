import { PredictionResult, RouteHistory, SuccessFactors, SuccessPrediction } from './types';

const MIN_SAMPLES_HIGH_CONFIDENCE = 20;
const MIN_SAMPLES_MEDIUM_CONFIDENCE = 5;
const MAX_VOLUME_RISK_THRESHOLD = 50000;

const history: RouteHistory[] = [];

/**
 * Stellar Transfer Success Predictor (#484).
 *
 * Analyzes route history to determine success rates and generates
 * predictions with confidence levels based on historical data,
 * route reliability, bridge health, and current conditions.
 */

export function recordRouteHistory(record: RouteHistory): void {
  const existing = history.findIndex((h) => h.routeId === record.routeId);
  if (existing !== -1) {
    history[existing] = record;
  } else {
    history.push(record);
  }
}

export function predictSuccess(routeId: string): SuccessPrediction | null {
  const record = history.find((h) => h.routeId === routeId);
  if (!record || record.totalTransfers === 0) {
    return null;
  }

  const factors = calculateFactors(record);
  const probability = calculateProbability(factors);
  const confidence = determineConfidence(record.totalTransfers);
  const recommendation = generateRecommendation(probability, factors);

  return {
    routeId,
    probability,
    confidence,
    factors,
    recommendation,
    sampleSize: record.totalTransfers,
    predictedAt: new Date(),
  };
}

export function predictSuccessWithDetails(routeId: string): PredictionResult | null {
  const prediction = predictSuccess(routeId);
  if (!prediction) return null;
  return prediction as PredictionResult;
}

export function getAllRouteHistory(): RouteHistory[] {
  return [...history];
}

export function clearHistory(): void {
  history.length = 0;
}

function calculateFactors(record: RouteHistory): SuccessFactors {
  const historicalSuccessRate =
    record.totalTransfers > 0
      ? record.successfulTransfers / record.totalTransfers
      : 0;

  const routeReliabilityScore = historicalSuccessRate;

  const bridgeHealthScore = calculateBridgeHealth(record.bridgeName);

  const volumeRiskFactor = calculateVolumeRisk(record.averageAmountUsd);

  const timeBasedFactor = calculateTimeFactor(record.lastExecutedAt);

  return {
    historicalSuccessRate,
    routeReliabilityScore,
    bridgeHealthScore,
    volumeRiskFactor,
    timeBasedFactor,
  };
}

function calculateProbability(factors: SuccessFactors): number {
  const weights = {
    historicalSuccessRate: 0.35,
    routeReliabilityScore: 0.25,
    bridgeHealthScore: 0.2,
    volumeRiskFactor: 0.1,
    timeBasedFactor: 0.1,
  };

  const weighted =
    factors.historicalSuccessRate * weights.historicalSuccessRate +
    factors.routeReliabilityScore * weights.routeReliabilityScore +
    factors.bridgeHealthScore * weights.bridgeHealthScore +
    factors.volumeRiskFactor * weights.volumeRiskFactor +
    factors.timeBasedFactor * weights.timeBasedFactor;

  return Math.max(0, Math.min(1, weighted));
}

function determineConfidence(sampleSize: number): 'low' | 'medium' | 'high' {
  if (sampleSize >= MIN_SAMPLES_HIGH_CONFIDENCE) return 'high';
  if (sampleSize >= MIN_SAMPLES_MEDIUM_CONFIDENCE) return 'medium';
  return 'low';
}

function calculateBridgeHealth(_bridgeName: string): number {
  return 0.95;
}

function calculateVolumeRisk(amountUsd: number): number {
  if (amountUsd <= 0) return 1;
  if (amountUsd >= MAX_VOLUME_RISK_THRESHOLD) return 0.3;
  return 1 - (amountUsd / MAX_VOLUME_RISK_THRESHOLD) * 0.5;
}

function calculateTimeFactor(lastExecutedAt: Date): number {
  const hoursSinceLastExecution =
    (Date.now() - lastExecutedAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastExecution < 1) return 1;
  if (hoursSinceLastExecution < 24) return 0.95;
  if (hoursSinceLastExecution < 168) return 0.85;
  return 0.7;
}

function generateRecommendation(probability: number, _factors: SuccessFactors): string {
  if (probability >= 0.9) {
    return 'High success probability - proceed with confidence';
  }
  if (probability >= 0.7) {
    return 'Good success probability - recommend proceeding';
  }
  if (probability >= 0.5) {
    return 'Moderate success probability - consider using a fallback route';
  }
  return 'Low success probability - strongly recommend using an alternative route or waiting for improved conditions';
}
