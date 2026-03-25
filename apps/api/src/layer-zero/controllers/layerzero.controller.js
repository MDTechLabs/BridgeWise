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
exports.LayerZeroController = void 0;
const common_1 = require("@nestjs/common");
const layerzero_type_1 = require("../types/layerzero.type");
class EstimateDto {
}
let LayerZeroController = (() => {
    let _classDecorators = [(0, common_1.Controller)('layerzero')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getEstimate_decorators;
    let _estimateFees_decorators;
    let _estimateLatency_decorators;
    let _checkHealth_decorators;
    let _checkAllHealth_decorators;
    let _getStatus_decorators;
    let _getChainStatus_decorators;
    var LayerZeroController = _classThis = class {
        constructor(layerZeroService) {
            this.layerZeroService = (__runInitializers(this, _instanceExtraInitializers), layerZeroService);
        }
        /**
         * Get complete bridge estimate (fees + latency)
         * POST /layerzero/estimate
         */
        async getEstimate(dto) {
            this.validateEstimateDto(dto);
            const route = {
                sourceChainId: dto.sourceChainId,
                destinationChainId: dto.destinationChainId,
                tokenAddress: dto.tokenAddress,
            };
            return this.layerZeroService.getBridgeEstimate(route, dto.payload);
        }
        /**
         * Get fee estimate only
         * POST /layerzero/estimate/fees
         */
        async estimateFees(dto) {
            this.validateEstimateDto(dto);
            const route = {
                sourceChainId: dto.sourceChainId,
                destinationChainId: dto.destinationChainId,
                tokenAddress: dto.tokenAddress,
            };
            return this.layerZeroService.estimateFees(route, dto.payload);
        }
        /**
         * Get latency estimate only
         * POST /layerzero/estimate/latency
         */
        async estimateLatency(dto) {
            this.validateRouteDto(dto);
            const route = {
                sourceChainId: dto.sourceChainId,
                destinationChainId: dto.destinationChainId,
                tokenAddress: dto.tokenAddress,
            };
            return this.layerZeroService.estimateLatency(route);
        }
        /**
         * Health check for specific chain
         * GET /layerzero/health/:chainId
         */
        async checkHealth(chainId) {
            if (!this.isValidChainId(chainId)) {
                throw new common_1.BadRequestException(`Invalid chain ID: ${chainId}`);
            }
            return this.layerZeroService.checkHealth(chainId);
        }
        /**
         * Health check for all chains
         * GET /layerzero/health
         */
        async checkAllHealth() {
            return this.layerZeroService.checkAllHealth();
        }
        /**
         * Get cached health status
         * GET /layerzero/status
         */
        getStatus() {
            const status = this.layerZeroService.getHealthStatus();
            if (!status)
                return [];
            return Array.isArray(status) ? status : [status];
        }
        /**
         * Get cached health status for specific chain
         * GET /layerzero/status/:chainId
         */
        getChainStatus(chainId) {
            if (!this.isValidChainId(chainId)) {
                throw new common_1.BadRequestException(`Invalid chain ID: ${chainId}`);
            }
            const status = this.layerZeroService.getHealthStatus(chainId);
            if (!status) {
                throw new common_1.BadRequestException(`No health data available for chain ${chainId}`);
            }
            return status;
        }
        /**
         * Private validation methods
         */
        validateEstimateDto(dto) {
            if (!this.isValidChainId(dto.sourceChainId)) {
                throw new common_1.BadRequestException(`Invalid source chain ID: ${dto.sourceChainId}`);
            }
            if (!this.isValidChainId(dto.destinationChainId)) {
                throw new common_1.BadRequestException(`Invalid destination chain ID: ${dto.destinationChainId}`);
            }
            if (dto.sourceChainId === dto.destinationChainId) {
                throw new common_1.BadRequestException('Source and destination chains must be different');
            }
            if (!dto.tokenAddress || !dto.tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
                throw new common_1.BadRequestException('Invalid token address');
            }
            if (!dto.payload || !dto.payload.startsWith('0x')) {
                throw new common_1.BadRequestException('Payload must be a hex string starting with 0x');
            }
        }
        validateRouteDto(dto) {
            if (!this.isValidChainId(dto.sourceChainId)) {
                throw new common_1.BadRequestException(`Invalid source chain ID: ${dto.sourceChainId}`);
            }
            if (!this.isValidChainId(dto.destinationChainId)) {
                throw new common_1.BadRequestException(`Invalid destination chain ID: ${dto.destinationChainId}`);
            }
            if (dto.sourceChainId === dto.destinationChainId) {
                throw new common_1.BadRequestException('Source and destination chains must be different');
            }
            if (!dto.tokenAddress || !dto.tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
                throw new common_1.BadRequestException('Invalid token address');
            }
        }
        isValidChainId(chainId) {
            return Object.values(layerzero_type_1.LayerZeroChainId).includes(chainId);
        }
    };
    __setFunctionName(_classThis, "LayerZeroController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _getEstimate_decorators = [(0, common_1.Post)('estimate'), (0, common_1.HttpCode)(common_1.HttpStatus.OK)];
        _estimateFees_decorators = [(0, common_1.Post)('estimate/fees'), (0, common_1.HttpCode)(common_1.HttpStatus.OK)];
        _estimateLatency_decorators = [(0, common_1.Post)('estimate/latency'), (0, common_1.HttpCode)(common_1.HttpStatus.OK)];
        _checkHealth_decorators = [(0, common_1.Get)('health/:chainId')];
        _checkAllHealth_decorators = [(0, common_1.Get)('health')];
        _getStatus_decorators = [(0, common_1.Get)('status')];
        _getChainStatus_decorators = [(0, common_1.Get)('status/:chainId')];
        __esDecorate(_classThis, null, _getEstimate_decorators, { kind: "method", name: "getEstimate", static: false, private: false, access: { has: obj => "getEstimate" in obj, get: obj => obj.getEstimate }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _estimateFees_decorators, { kind: "method", name: "estimateFees", static: false, private: false, access: { has: obj => "estimateFees" in obj, get: obj => obj.estimateFees }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _estimateLatency_decorators, { kind: "method", name: "estimateLatency", static: false, private: false, access: { has: obj => "estimateLatency" in obj, get: obj => obj.estimateLatency }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _checkHealth_decorators, { kind: "method", name: "checkHealth", static: false, private: false, access: { has: obj => "checkHealth" in obj, get: obj => obj.checkHealth }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _checkAllHealth_decorators, { kind: "method", name: "checkAllHealth", static: false, private: false, access: { has: obj => "checkAllHealth" in obj, get: obj => obj.checkAllHealth }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getStatus_decorators, { kind: "method", name: "getStatus", static: false, private: false, access: { has: obj => "getStatus" in obj, get: obj => obj.getStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getChainStatus_decorators, { kind: "method", name: "getChainStatus", static: false, private: false, access: { has: obj => "getChainStatus" in obj, get: obj => obj.getChainStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        LayerZeroController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return LayerZeroController = _classThis;
})();
exports.LayerZeroController = LayerZeroController;
//# sourceMappingURL=layerzero.controller.js.map