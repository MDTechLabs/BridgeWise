"use strict";
/**
 * Bridge Analytics Module
 *
 * Provides comprehensive analytics for BridgeWise bridge operations.
 * Includes data collection, aggregation, API endpoints, and React hooks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateBridgeAnalytics1700000000000 = exports.UserActivityInsightsDto = exports.SlippageStatisticsDto = exports.TopPerformingBridgesDto = exports.TimeSeriesAnalyticsDto = exports.TimeSeriesDataPointDto = exports.RouteAnalyticsDto = exports.BridgeAnalyticsResponseDto = exports.BridgeAnalyticsQueryDto = exports.BridgeAnalytics = exports.AnalyticsController = exports.AnalyticsCollector = exports.AnalyticsService = exports.AnalyticsModule = void 0;
// Module
var analytics_module_1 = require("./analytics.module");
Object.defineProperty(exports, "AnalyticsModule", { enumerable: true, get: function () { return analytics_module_1.AnalyticsModule; } });
// Services
var analytics_service_1 = require("./analytics.service");
Object.defineProperty(exports, "AnalyticsService", { enumerable: true, get: function () { return analytics_service_1.AnalyticsService; } });
var analytics_collector_1 = require("./analytics.collector");
Object.defineProperty(exports, "AnalyticsCollector", { enumerable: true, get: function () { return analytics_collector_1.AnalyticsCollector; } });
// Controller
var analytics_controller_1 = require("./analytics.controller");
Object.defineProperty(exports, "AnalyticsController", { enumerable: true, get: function () { return analytics_controller_1.AnalyticsController; } });
// Entities
var bridge_analytics_entity_1 = require("./entities/bridge-analytics.entity");
Object.defineProperty(exports, "BridgeAnalytics", { enumerable: true, get: function () { return bridge_analytics_entity_1.BridgeAnalytics; } });
// DTOs
var bridge_analytics_dto_1 = require("./dto/bridge-analytics.dto");
Object.defineProperty(exports, "BridgeAnalyticsQueryDto", { enumerable: true, get: function () { return bridge_analytics_dto_1.BridgeAnalyticsQueryDto; } });
Object.defineProperty(exports, "BridgeAnalyticsResponseDto", { enumerable: true, get: function () { return bridge_analytics_dto_1.BridgeAnalyticsResponseDto; } });
Object.defineProperty(exports, "RouteAnalyticsDto", { enumerable: true, get: function () { return bridge_analytics_dto_1.RouteAnalyticsDto; } });
Object.defineProperty(exports, "TimeSeriesDataPointDto", { enumerable: true, get: function () { return bridge_analytics_dto_1.TimeSeriesDataPointDto; } });
Object.defineProperty(exports, "TimeSeriesAnalyticsDto", { enumerable: true, get: function () { return bridge_analytics_dto_1.TimeSeriesAnalyticsDto; } });
Object.defineProperty(exports, "TopPerformingBridgesDto", { enumerable: true, get: function () { return bridge_analytics_dto_1.TopPerformingBridgesDto; } });
Object.defineProperty(exports, "SlippageStatisticsDto", { enumerable: true, get: function () { return bridge_analytics_dto_1.SlippageStatisticsDto; } });
Object.defineProperty(exports, "UserActivityInsightsDto", { enumerable: true, get: function () { return bridge_analytics_dto_1.UserActivityInsightsDto; } });
// Migration
var _1700000000000_CreateBridgeAnalytics_1 = require("./migrations/1700000000000-CreateBridgeAnalytics");
Object.defineProperty(exports, "CreateBridgeAnalytics1700000000000", { enumerable: true, get: function () { return _1700000000000_CreateBridgeAnalytics_1.CreateBridgeAnalytics1700000000000; } });
//# sourceMappingURL=index.js.map