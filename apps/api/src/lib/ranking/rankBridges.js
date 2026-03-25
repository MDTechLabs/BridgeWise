"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankBridges = rankBridges;
const normalizers_1 = require("./normalizers");
const scorer_1 = require("./scorer");
const weights_1 = require("./weights");
/**
 * Core ranking engine.
 *
 * Takes a list of raw bridge routes, normalizes all scoring factors
 * across the full set, applies the weighted formula, and returns
 * the routes sorted by finalScore descending with rank assigned.
 *
 * @param routes   - Raw bridge route data from the aggregation engine
 * @param weights  - Optional weight overrides (uses env vars if omitted)
 * @returns        - Sorted, ranked routes with composite scores
 */
function rankBridges(routes, weights) {
    if (!routes.length)
        return [];
    const resolvedWeights = weights ?? (0, weights_1.getRankingWeights)();
    // Extract raw arrays for batch normalization
    const feeCosts = routes.map((r) => r.feeCostUSD);
    const times = routes.map((r) => r.estimatedTimeSeconds);
    const reliabilities = routes.map((r) => r.reliabilityScore);
    const failureRates = routes.map((r) => r.failureRate);
    const liquidities = routes.map((r) => r.liquidityUSD);
    // Normalize all factors across the full route set
    const costScores = (0, normalizers_1.normalizeCostScores)(feeCosts);
    const speedScores = (0, normalizers_1.normalizeSpeedScores)(times);
    const reliabilityScores = (0, normalizers_1.normalizeReliabilityScores)(reliabilities, failureRates);
    const liquidityScores = (0, normalizers_1.normalizeLiquidityScores)(liquidities);
    // Build scored routes
    const scored = routes.map((route, i) => {
        const scores = {
            costScore: costScores[i],
            speedScore: speedScores[i],
            reliabilityScore: reliabilityScores[i],
            liquidityScore: liquidityScores[i],
        };
        return {
            ...route,
            scores,
            finalScore: (0, scorer_1.computeFinalScore)(scores, resolvedWeights),
            rank: 0, // assigned after sort
        };
    });
    // Sort descending by finalScore
    scored.sort((a, b) => b.finalScore - a.finalScore);
    // Assign rank (1-based)
    scored.forEach((route, i) => {
        route.rank = i + 1;
    });
    return scored;
}
//# sourceMappingURL=rankBridges.js.map