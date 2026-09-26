import type { SlaDataPoint, SlaProviderConfig, SlaComplianceMetrics } from './types';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (1 - (idx % 1)) + sorted[hi] * (idx % 1);
}

export function calculateCompliance(
  config: SlaProviderConfig,
  dataPoints: SlaDataPoint[],
): SlaComplianceMetrics {
  const points = dataPoints.filter((d) => d.providerId === config.providerId);

  const totalChecks = points.length;
  const successfulChecks = points.filter((d) => d.available).length;
  const failedChecks = totalChecks - successfulChecks;

  const uptimePercent = totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 0;

  const responseTimes = points
    .filter((d) => d.available)
    .map((d) => d.responseTimeMs)
    .sort((a, b) => a - b);

  const avgResponseTimeMs =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

  const p95ResponseTimeMs = percentile(responseTimes, 95);
  const reliability = totalChecks > 0 ? successfulChecks / totalChecks : 0;

  const periodStart = points.length > 0 ? points[0].timestamp : new Date();
  const periodEnd = points.length > 0 ? points[points.length - 1].timestamp : new Date();

  const slaUptimeMet = uptimePercent >= config.uptimeSlaPercent;
  const slaResponseTimeMet = avgResponseTimeMs <= config.maxResponseTimeMs;
  const slaReliabilityMet = reliability >= config.minReliability;

  return {
    providerId: config.providerId,
    periodStart,
    periodEnd,
    totalChecks,
    successfulChecks,
    failedChecks,
    measuredUptimePercent: uptimePercent,
    avgResponseTimeMs,
    p95ResponseTimeMs,
    reliability,
    slaUptimeMet,
    slaResponseTimeMet,
    slaReliabilityMet,
    overallCompliant: slaUptimeMet && slaResponseTimeMet && slaReliabilityMet,
  };
}
