import {
  LatencyPrediction,
  RouteLatencyRecord,
} from './latency-predictor.types';

// Sample-count thresholds used to determine how confident we are in a prediction.
// Fewer samples => lower confidence, since the estimate is more likely to be noisy.
const MIN_SAMPLES_FOR_HIGH_CONFIDENCE = 10;
const MIN_SAMPLES_FOR_MEDIUM_CONFIDENCE = 3;

// In-memory store of all recorded latency observations across all routes.
// Note: this is module-level state, so it persists for the lifetime of the process
// and is shared by anyone importing this module.
const history: RouteLatencyRecord[] = [];

/**
 * Adds a new latency observation to the in-memory history.
 * @param record - The latency record to store (includes routeId, durationMs, success, etc.)
 */
export function recordLatency(record: RouteLatencyRecord): void {
  history.push(record);
}

/**
 * Predicts the expected latency for a given route based on historical data.
 *
 * Only successful records are considered, since failed attempts don't reflect
 * typical transfer latency. The prediction blends two signals:
 *   - A simple mean of all durations (stable, but slow to react to recent changes).
 *   - An exponential moving average (EMA), which weights more recent records
 *     more heavily so the prediction adapts faster to changing conditions.
 *
 * The final estimate is a weighted blend of the two (40% mean, 60% EMA),
 * favoring recency while still smoothing out noise.
 *
 * @param routeId - The route to predict latency for.
 * @returns A LatencyPrediction with the estimated latency and a confidence score,
 *   or `null` if there are no successful historical records for this route.
 */
export function predictLatency(routeId: string): LatencyPrediction | null {
  // Only consider successful transfers on this specific route.
  const records = history.filter((r) => r.routeId === routeId && r.success);

  if (records.length === 0) {
    return null;
  }

  const durations = records.map((r) => r.durationMs);

  // Simple arithmetic mean of all observed durations.
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;

  // Weight recent records more heavily (exponential moving average).
  // Note: `durations` is in insertion order (oldest first), so later entries
  // are treated as "more recent" and given more weight via `alpha`.
  // `alpha` is recalculated each iteration based on total length, which is a bit
  // unconventional (typically alpha is a fixed constant), but keeps the smoothing
  // factor consistent relative to the sample size for this run.
  const ema = durations.reduce((acc, val, i) => {
    const alpha = 2 / (durations.length + 1);
    return i === 0 ? val : acc * (1 - alpha) + val * alpha;
  }, 0);

  // Blend the mean and EMA, weighting recency (EMA) more heavily.
  const estimatedMs = Math.round(mean * 0.4 + ema * 0.6);

  // Confidence scales with how much data we have to base the prediction on.
  const confidence =
    records.length >= MIN_SAMPLES_FOR_HIGH_CONFIDENCE
      ? 0.9
      : records.length >= MIN_SAMPLES_FOR_MEDIUM_CONFIDENCE
        ? 0.6
        : 0.3;

  return {
    routeId,
    estimatedMs,
    confidence,
    sampleCount: records.length,
    predictedAt: new Date(),
  };
}

/**
 * Clears all recorded latency history for every route.
 * Mutates the array in place (rather than reassigning) so any external
 * references to `history` stay valid and see the cleared state.
 */
export function clearHistory(): void {
  history.length = 0;
}
