"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReliabilityCalculatorService = void 0;
const common_1 = require("@nestjs/common");
const reliability_constants_1 = require("./reliability.constants");
const reliability_enum_1 = require("./reliability.enum");
let ReliabilityCalculatorService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ReliabilityCalculatorService = _classThis = class {
        /**
         * Compute reliability percentage from raw counts.
         * Cancelled transactions are already excluded at query level.
         */
        computeReliabilityPercent(counts) {
            if (counts.totalAttempts < reliability_constants_1.RELIABILITY_CONSTANTS.MIN_ATTEMPTS_FOR_SCORE) {
                return 0;
            }
            return parseFloat(((counts.successfulTransfers / counts.totalAttempts) * 100).toFixed(2));
        }
        /**
         * Normalize reliability percentage to a 0-100 score.
         * Currently 1:1 since percent is already 0-100, but this layer
         * allows future weighting (e.g., heavier penalty for timeouts).
         */
        computeReliabilityScore(counts) {
            const percent = this.computeReliabilityPercent(counts);
            if (counts.totalAttempts < reliability_constants_1.RELIABILITY_CONSTANTS.MIN_ATTEMPTS_FOR_SCORE) {
                return 0;
            }
            // Apply extra timeout penalty: each timeout beyond a threshold reduces score
            const timeoutRatio = counts.timeoutCount / counts.totalAttempts;
            const timeoutPenalty = Math.min(timeoutRatio * 10, 5); // max 5-point penalty
            const rawScore = percent - timeoutPenalty;
            return parseFloat(Math.max(reliability_constants_1.RELIABILITY_CONSTANTS.MIN_SCORE, Math.min(reliability_constants_1.RELIABILITY_CONSTANTS.MAX_SCORE, rawScore)).toFixed(2));
        }
        /**
         * Determine tier based on reliability percent.
         */
        computeTier(reliabilityPercent) {
            if (reliabilityPercent >= reliability_constants_1.RELIABILITY_CONSTANTS.HIGH_THRESHOLD) {
                return reliability_enum_1.ReliabilityTier.HIGH;
            }
            if (reliabilityPercent >= reliability_constants_1.RELIABILITY_CONSTANTS.MEDIUM_THRESHOLD) {
                return reliability_enum_1.ReliabilityTier.MEDIUM;
            }
            return reliability_enum_1.ReliabilityTier.LOW;
        }
        /**
         * Build badge DTO for UI display.
         */
        buildBadge(reliabilityPercent, windowSize, windowMode) {
            const tier = this.computeTier(reliabilityPercent);
            const colorMap = {
                [reliability_enum_1.ReliabilityTier.HIGH]: '#22c55e',
                [reliability_enum_1.ReliabilityTier.MEDIUM]: '#f59e0b',
                [reliability_enum_1.ReliabilityTier.LOW]: '#ef4444',
            };
            const windowDesc = windowMode === 'TIME_BASED'
                ? `last ${windowSize} days`
                : `last ${windowSize} transactions`;
            return {
                tier,
                label: reliability_constants_1.RELIABILITY_BADGE_LABELS[tier],
                color: colorMap[tier],
                tooltip: `Score based on ${windowDesc}. Excludes user-cancelled events. Minimum ${reliability_constants_1.RELIABILITY_CONSTANTS.MIN_ATTEMPTS_FOR_SCORE} attempts required.`,
            };
        }
        /**
         * Compute ranking penalty for bridges below threshold.
         * Used by Smart Bridge Ranking (Issue #5).
         */
        computeRankingPenalty(reliabilityScore, threshold = reliability_constants_1.RELIABILITY_CONSTANTS.MEDIUM_THRESHOLD) {
            if (reliabilityScore < threshold) {
                return reliability_constants_1.RELIABILITY_CONSTANTS.PENALTY_BELOW_THRESHOLD;
            }
            return 0;
        }
        /**
         * Produce adjusted score for ranking engine.
         * Ranking engine calls this to integrate reliability.
         */
        applyReliabilityToRankingScore(baseRankingScore, reliabilityScore, options = {}) {
            if (options.ignoreReliability)
                return baseRankingScore;
            const weight = options.weight ?? 0.2; // 20% weight by default
            const penalty = this.computeRankingPenalty(reliabilityScore, options.threshold);
            const reliabilityContribution = reliabilityScore * weight;
            const baseContribution = baseRankingScore * (1 - weight);
            return parseFloat(Math.max(0, baseContribution + reliabilityContribution - penalty).toFixed(2));
        }
    };
    __setFunctionName(_classThis, "ReliabilityCalculatorService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ReliabilityCalculatorService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ReliabilityCalculatorService = _classThis;
})();
exports.ReliabilityCalculatorService = ReliabilityCalculatorService;
//# sourceMappingURL=reliability-calculator.service.js.map