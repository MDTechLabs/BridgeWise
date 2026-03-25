"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const bridge_analytics_dto_1 = require("./dto/bridge-analytics.dto");
/**
 * Analytics Controller
 *
 * REST API endpoints for BridgeWise analytics data.
 * Provides metrics on bridge usage, performance, and trends.
 */
let AnalyticsController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('Bridge Analytics'), (0, common_1.Controller)('api/v1/bridge-analytics')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getAnalytics_decorators;
    let _getRouteAnalytics_decorators;
    let _getTimeSeriesAnalytics_decorators;
    let _getTopPerformingBridges_decorators;
    let _getSlippageStatistics_decorators;
    let _getUserActivityInsights_decorators;
    let _recalculateAnalytics_decorators;
    var AnalyticsController = _classThis = class {
        constructor(analyticsService) {
            this.analyticsService = (__runInitializers(this, _instanceExtraInitializers), analyticsService);
        }
        /**
         * Get aggregated analytics data with optional filters
         */
        async getAnalytics(query) {
            return this.analyticsService.getAnalytics(query);
        }
        /**
         * Get analytics for a specific route
         */
        async getRouteAnalytics(bridgeName, sourceChain, destinationChain, token) {
            const analytics = await this.analyticsService.getRouteAnalytics(bridgeName, sourceChain, destinationChain, token);
            if (!analytics) {
                // Return empty analytics for new routes
                return {
                    bridgeName,
                    sourceChain,
                    destinationChain,
                    token,
                    totalTransfers: 0,
                    successfulTransfers: 0,
                    failedTransfers: 0,
                    successRate: 0,
                    failureRate: 0,
                    totalVolume: 0,
                    lastUpdated: new Date(),
                };
            }
            return analytics;
        }
        /**
         * Get time-series analytics data for trend analysis
         */
        async getTimeSeriesAnalytics(bridgeName, sourceChain, destinationChain, granularity, startDate, endDate, token) {
            return this.analyticsService.getTimeSeriesAnalytics(bridgeName, sourceChain, destinationChain, granularity, new Date(startDate), new Date(endDate), token);
        }
        /**
         * Get top performing bridges
         */
        async getTopPerformingBridges(limit) {
            const limitNum = limit ? parseInt(limit, 10) : 10;
            return this.analyticsService.getTopPerformingBridges(limitNum);
        }
        /**
         * Get slippage statistics for a route
         */
        async getSlippageStatistics(bridgeName, sourceChain, destinationChain, token) {
            const stats = await this.analyticsService.getSlippageStatistics(bridgeName, sourceChain, destinationChain, token);
            if (!stats) {
                return { message: 'No slippage data available for this route' };
            }
            return stats;
        }
        /**
         * Get user activity insights
         */
        async getUserActivityInsights() {
            return this.analyticsService.getUserActivityInsights();
        }
        /**
         * Trigger analytics recalculation
         * Useful for initial setup or data correction
         */
        async recalculateAnalytics() {
            await this.analyticsService.recalculateAllAnalytics();
            return { message: 'Analytics recalculation completed successfully' };
        }
    };
    __setFunctionName(_classThis, "AnalyticsController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _getAnalytics_decorators = [(0, common_1.Get)(), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                summary: 'Get bridge analytics data',
                description: 'Returns aggregated analytics metrics for bridge routes with optional filtering by bridge, chain, token, and time range.',
            }), (0, swagger_1.ApiResponse)({
                status: common_1.HttpStatus.OK,
                description: 'Analytics data retrieved successfully',
                type: bridge_analytics_dto_1.BridgeAnalyticsResponseDto,
            }), (0, swagger_1.ApiResponse)({
                status: common_1.HttpStatus.BAD_REQUEST,
                description: 'Invalid query parameters',
            })];
        _getRouteAnalytics_decorators = [(0, common_1.Get)('routes/:bridgeName/:sourceChain/:destinationChain'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                summary: 'Get analytics for a specific route',
                description: 'Returns detailed analytics for a specific bridge route.',
            }), (0, swagger_1.ApiResponse)({
                status: common_1.HttpStatus.OK,
                description: 'Route analytics retrieved successfully',
                type: bridge_analytics_dto_1.RouteAnalyticsDto,
            }), (0, swagger_1.ApiResponse)({
                status: common_1.HttpStatus.NOT_FOUND,
                description: 'Route analytics not found',
            }), (0, swagger_1.ApiQuery)({
                name: 'token',
                required: false,
                description: 'Filter by token symbol',
            })];
        _getTimeSeriesAnalytics_decorators = [(0, common_1.Get)('trends/:bridgeName/:sourceChain/:destinationChain'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                summary: 'Get time-series analytics trends',
                description: 'Returns time-series data for analyzing trends over time.',
            }), (0, swagger_1.ApiResponse)({
                status: common_1.HttpStatus.OK,
                description: 'Trend data retrieved successfully',
                type: bridge_analytics_dto_1.TimeSeriesAnalyticsDto,
            }), (0, swagger_1.ApiResponse)({
                status: common_1.HttpStatus.BAD_REQUEST,
                description: 'Invalid parameters',
            }), (0, swagger_1.ApiQuery)({
                name: 'granularity',
                required: true,
                enum: ['hour', 'day', 'week', 'month'],
                description: 'Time granularity for data points',
            }), (0, swagger_1.ApiQuery)({
                name: 'startDate',
                required: true,
                description: 'Start date (ISO 8601)',
            }), (0, swagger_1.ApiQuery)({
                name: 'endDate',
                required: true,
                description: 'End date (ISO 8601)',
            }), (0, swagger_1.ApiQuery)({
                name: 'token',
                required: false,
                description: 'Filter by token symbol',
            })];
        _getTopPerformingBridges_decorators = [(0, common_1.Get)('top-performing'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                summary: 'Get top performing bridges',
                description: 'Returns top bridges ranked by volume, success rate, and speed.',
            }), (0, swagger_1.ApiResponse)({
                status: common_1.HttpStatus.OK,
                description: 'Top performing bridges retrieved successfully',
                type: bridge_analytics_dto_1.TopPerformingBridgesDto,
            }), (0, swagger_1.ApiQuery)({
                name: 'limit',
                required: false,
                description: 'Number of results per category (default: 10)',
            })];
        _getSlippageStatistics_decorators = [(0, common_1.Get)('slippage/:bridgeName/:sourceChain/:destinationChain'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                summary: 'Get slippage statistics',
                description: 'Returns slippage distribution and statistics for a route.',
            }), (0, swagger_1.ApiResponse)({
                status: common_1.HttpStatus.OK,
                description: 'Slippage statistics retrieved successfully',
                type: bridge_analytics_dto_1.SlippageStatisticsDto,
            }), (0, swagger_1.ApiResponse)({
                status: common_1.HttpStatus.NOT_FOUND,
                description: 'No slippage data available',
            }), (0, swagger_1.ApiQuery)({
                name: 'token',
                required: false,
                description: 'Filter by token symbol',
            })];
        _getUserActivityInsights_decorators = [(0, common_1.Get)('insights/user-activity'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                summary: 'Get user activity insights',
                description: 'Returns aggregated user activity metrics and popular routes.',
            }), (0, swagger_1.ApiResponse)({
                status: common_1.HttpStatus.OK,
                description: 'User activity insights retrieved successfully',
                type: bridge_analytics_dto_1.UserActivityInsightsDto,
            })];
        _recalculateAnalytics_decorators = [(0, common_1.Get)('admin/recalculate'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                summary: 'Recalculate all analytics',
                description: 'Recalculates all analytics from raw data. Use with caution.',
            }), (0, swagger_1.ApiResponse)({
                status: common_1.HttpStatus.OK,
                description: 'Analytics recalculation started',
            })];
        __esDecorate(_classThis, null, _getAnalytics_decorators, { kind: "method", name: "getAnalytics", static: false, private: false, access: { has: obj => "getAnalytics" in obj, get: obj => obj.getAnalytics }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getRouteAnalytics_decorators, { kind: "method", name: "getRouteAnalytics", static: false, private: false, access: { has: obj => "getRouteAnalytics" in obj, get: obj => obj.getRouteAnalytics }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getTimeSeriesAnalytics_decorators, { kind: "method", name: "getTimeSeriesAnalytics", static: false, private: false, access: { has: obj => "getTimeSeriesAnalytics" in obj, get: obj => obj.getTimeSeriesAnalytics }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getTopPerformingBridges_decorators, { kind: "method", name: "getTopPerformingBridges", static: false, private: false, access: { has: obj => "getTopPerformingBridges" in obj, get: obj => obj.getTopPerformingBridges }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getSlippageStatistics_decorators, { kind: "method", name: "getSlippageStatistics", static: false, private: false, access: { has: obj => "getSlippageStatistics" in obj, get: obj => obj.getSlippageStatistics }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getUserActivityInsights_decorators, { kind: "method", name: "getUserActivityInsights", static: false, private: false, access: { has: obj => "getUserActivityInsights" in obj, get: obj => obj.getUserActivityInsights }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _recalculateAnalytics_decorators, { kind: "method", name: "recalculateAnalytics", static: false, private: false, access: { has: obj => "recalculateAnalytics" in obj, get: obj => obj.recalculateAnalytics }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AnalyticsController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AnalyticsController = _classThis;
})();
exports.AnalyticsController = AnalyticsController;
//# sourceMappingURL=analytics.controller.js.map