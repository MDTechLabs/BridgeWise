"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recommendBridgeRoutes = recommendBridgeRoutes;
function recommendBridgeRoutes(input) {
    const errors = [];
    if (!input.routes || input.routes.length === 0) {
        errors.push('No bridge routes available');
        return { rankedRoutes: [], errors };
    }
    // Fallback: rank by fee if metrics missing
    const hasMetrics = input.routes.some((r) => r.reliabilityScore !== undefined && r.historicalSuccessRate !== undefined);
    const rankedRoutes = input.routes.map((route) => {
        // Score calculation
        let score = 0;
        const breakdown = {};
        // Dynamic fee (lower is better)
        score += 100 - route.fee * 10;
        breakdown.fee = route.fee;
        // Slippage (lower is better)
        score += 100 - route.slippage * 10;
        breakdown.slippage = route.slippage;
        // Estimated time (lower is better)
        score += 100 - route.estimatedTime;
        breakdown.estimatedTime = route.estimatedTime;
        // Reliability (higher is better)
        if (route.reliabilityScore !== undefined) {
            score += route.reliabilityScore * 100;
            breakdown.reliabilityScore = route.reliabilityScore;
        }
        // Historical success rate (higher is better)
        if (route.historicalSuccessRate !== undefined) {
            score += route.historicalSuccessRate * 100;
            breakdown.historicalSuccessRate = route.historicalSuccessRate;
        }
        breakdown.score = score;
        return { route, score, breakdown };
    });
    // Sort by score descending
    rankedRoutes.sort((a, b) => b.score - a.score);
    return { rankedRoutes, errors };
}
//# sourceMappingURL=bridge-recommendation.engine.js.map