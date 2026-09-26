/**
 * File: apps/dashboard/intelligence/stellar/metrics.ts
 *
 * Pure helpers used by the Soroban Bridge Intelligence Dashboard.
 *
 * The dashboard leans on small, testable helpers so that the visual layer
 * never has to do arbitrary math inline. Every helper is side-effect free
 * and easy to plug into a Storybook story or a future CLI renderer.
 */

import type { TrendPoint } from './types';

/** Round to a fixed precision (defaults to 2 decimals) for display. */
export function round(value: number, precision = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/**
 * Compute a percentage change between two values. Returns 0 when the
 * previous value is zero so the UI never shows `NaN%` or `Infinity%`.
 */
export function percentageChange(
  previous: number,
  current: number,
): number {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return 0;
  if (previous === 0) return current === 0 ? 0 : 100;
  return round(((current - previous) / previous) * 100, 2);
}

/**
 * Compare the most recent two points of a trend and return the direction
 * plus the percentage delta. Uses `percentageChange` internally.
 */
export function trendDirection(points: TrendPoint[]): {
  direction: 'up' | 'down' | 'flat';
  delta: number;
} {
  if (!Array.isArray(points) || points.length < 2) {
    return { direction: 'flat', delta: 0 };
  }
  const last = points[points.length - 1].value;
  const prev = points[points.length - 2].value;
  const delta = percentageChange(prev, last);
  if (delta > 0.5) return { direction: 'up', delta };
  if (delta < -0.5) return { direction: 'down', delta };
  return { direction: 'flat', delta };
}

/**
 * Bucket a reliability score (0–1) into the human readable tiers surfaced
 * in the dashboard's "Health" column.
 */
export function reliabilityTier(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 0.95) return 'excellent';
  if (score >= 0.85) return 'good';
  if (score >= 0.7) return 'fair';
  return 'poor';
}

/**
 * Aggregate volumes across many metric objects (used for the page-level
 * "Total volume" call-out).
 */
export function sumVolume<T extends { totalVolumeUsd: number }>(items: T[]): number {
  return items.reduce((acc, item) => acc + (item.totalVolumeUsd || 0), 0);
}

/**
 * Compute a simple "network health" score in [0, 1] from the route/provide
 * success-rate inputs. Used as the dashboard's headline indicator.
 */
export function computeNetworkHealth(input: {
  averageSuccessRate: number;
  averageReliability: number;
  averageLatencySeconds: number;
}): number {
  const { averageSuccessRate, averageReliability, averageLatencySeconds } = input;
  const latencyPenalty = Math.min(averageLatencySeconds / 600, 1);
  // 50/40/10 weighting keeps success-rate the dominant factor.
  return round(
    averageSuccessRate * 0.5 +
      averageReliability * 0.4 -
      latencyPenalty * 0.1,
    3,
  );
}
