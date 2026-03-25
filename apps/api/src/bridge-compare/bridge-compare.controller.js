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
exports.BridgeCompareController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
let BridgeCompareController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('bridge-compare'), (0, common_1.Controller)('bridge-compare'), (0, common_1.UsePipes)(new common_1.ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
        }))];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getQuotes_decorators;
    let _getRouteDetails_decorators;
    let _getSupportedBridges_decorators;
    var BridgeCompareController = _classThis = class {
        constructor(bridgeCompareService) {
            this.bridgeCompareService = (__runInitializers(this, _instanceExtraInitializers), bridgeCompareService);
        }
        async getQuotes(dto) {
            return this.bridgeCompareService.getQuotes(dto);
        }
        async getRouteDetails(bridgeId, dto) {
            return this.bridgeCompareService.getRouteDetails(dto, bridgeId);
        }
        getSupportedBridges() {
            return this.bridgeCompareService.getSupportedBridges();
        }
    };
    __setFunctionName(_classThis, "BridgeCompareController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _getQuotes_decorators = [(0, common_1.Get)('quotes'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                summary: 'Fetch ranked bridge quotes',
                description: 'Returns normalized, ranked quotes from all supported bridge providers for the requested route.',
            }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'Ranked quotes returned successfully',
            }), (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid request parameters' }), (0, swagger_1.ApiNotFoundResponse)({ description: 'No routes found for the token pair' }), (0, swagger_1.ApiServiceUnavailableResponse)({
                description: 'All bridge providers unavailable',
            })];
        _getRouteDetails_decorators = [(0, common_1.Get)('quotes/:bridgeId'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                summary: 'Get specific bridge route details',
                description: 'Returns the full normalized quote for a specific bridge provider.',
            }), (0, swagger_1.ApiParam)({
                name: 'bridgeId',
                description: 'Bridge provider identifier',
                example: 'stargate',
            }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Route details returned' }), (0, swagger_1.ApiNotFoundResponse)({ description: 'Route not found' })];
        _getSupportedBridges_decorators = [(0, common_1.Get)('providers'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                summary: 'List all supported bridge providers',
                description: 'Returns all configured bridge providers with their supported chains and tokens.',
            }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Providers listed successfully' })];
        __esDecorate(_classThis, null, _getQuotes_decorators, { kind: "method", name: "getQuotes", static: false, private: false, access: { has: obj => "getQuotes" in obj, get: obj => obj.getQuotes }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getRouteDetails_decorators, { kind: "method", name: "getRouteDetails", static: false, private: false, access: { has: obj => "getRouteDetails" in obj, get: obj => obj.getRouteDetails }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getSupportedBridges_decorators, { kind: "method", name: "getSupportedBridges", static: false, private: false, access: { has: obj => "getSupportedBridges" in obj, get: obj => obj.getSupportedBridges }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeCompareController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeCompareController = _classThis;
})();
exports.BridgeCompareController = BridgeCompareController;
//# sourceMappingURL=bridge-compare.controller.js.map