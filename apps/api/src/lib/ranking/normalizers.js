"use strict";
/**
 * Normalizes a set of values to a 0–100 scale.
 * Lower is better for cost/time (inverted), higher is better for reliability/liquidity.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCostScores = normalizeCostScores;
exports.normalizeSpeedScores = normalizeSpeedScores;
exports.normalizeReliabilityScores = normalizeReliabilityScores;
exports.normalizeLiquidityScores = normalizeLiquidityScores;
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/**
 * Min-max normalization — higher raw value → higher score.
 */
function normalizeAscending(value, min, max) {
    if (max === min)
        return 100;
    return clamp(((value - min) / (max - min)) * 100, 0, 100);
}
/**
 * Min-max normalization — lower raw value → higher score (inverted).
 */
function normalizeDescending(value, min, max) {
    if (max === min)
        return 100;
    return clamp(((max - value) / (max - min)) * 100, 0, 100);
}
function normalizeCostScores(feeCosts) {
    const min = Math.min(...feeCosts);
    const max = Math.max(...feeCosts);
    return feeCosts.map((fee) => normalizeDescending(fee, min, max));
}
function normalizeSpeedScores(timesSeconds) {
    const min = Math.min(...timesSeconds);
    const max = Math.max(...timesSeconds);
    return timesSeconds.map((t) => normalizeDescending(t, min, max));
}
/**
 * Reliability = reliabilityScore (0–100) penalized by failure rate.
 * Combined = reliabilityScore * (1 - failureRate), then re-normalized.
 */
function normalizeReliabilityScores(reliabilityScores, failureRates) {
    const combined = reliabilityScores.map((score, i) => score * (1 - clamp(failureRates[i], 0, 1)));
    const min = Math.min(...combined);
    const max = Math.max(...combined);
    return combined.map((v) => normalizeAscending(v, min, max));
}
function normalizeLiquidityScores(liquidityValues) {
    const min = Math.min(...liquidityValues);
    const max = Math.max(...liquidityValues);
    return liquidityValues.map((v) => normalizeAscending(v, min, max));
}
//# sourceMappingURL=normalizers.js.map