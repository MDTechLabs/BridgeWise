"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeFinalScore = computeFinalScore;
/**
 * Computes the composite score (0–100) for a single bridge route
 * using the weighted formula:
 *
 *   finalScore =
 *     (costScore        * weights.cost)        +
 *     (speedScore       * weights.speed)       +
 *     (reliabilityScore * weights.reliability) +
 *     (liquidityScore   * weights.liquidity)
 */
function computeFinalScore(scores, weights) {
    const raw = scores.costScore * weights.cost +
        scores.speedScore * weights.speed +
        scores.reliabilityScore * weights.reliability +
        scores.liquidityScore * weights.liquidity;
    // Round to 2 decimal places, clamp to 0–100
    return Math.min(100, Math.max(0, parseFloat(raw.toFixed(2))));
}
//# sourceMappingURL=scorer.js.map