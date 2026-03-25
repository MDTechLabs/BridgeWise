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
exports.LayerZeroAdapter = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
let LayerZeroAdapter = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var LayerZeroAdapter = _classThis = class {
        constructor(httpService, configService) {
            this.httpService = httpService;
            this.configService = configService;
            this.logger = new common_1.Logger(LayerZeroAdapter.name);
            this.baseUrl = this.configService.get('LAYERZERO_API_URL', 'https://api.layerzero.network');
            this.timeoutMs = this.configService.get('ADAPTER_TIMEOUT', 5000);
            this.retryAttempts = this.configService.get('ADAPTER_RETRY', 3);
            this.defaultSourceChain = this.configService.get('LAYERZERO_SOURCE_CHAIN', 'ethereum');
            this.defaultDestinationChain = this.configService.get('LAYERZERO_DESTINATION_CHAIN', 'arbitrum');
        }
        async getFees(sourceChain, destinationChain) {
            const source = sourceChain || this.defaultSourceChain;
            const destination = destinationChain || this.defaultDestinationChain;
            for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
                try {
                    // LayerZero typically requires estimating fees for a specific route
                    const response = await (0, rxjs_1.firstValueFrom)(this.httpService
                        .get(`${this.baseUrl}/v1/estimate`, {
                        params: {
                            source,
                            destination,
                        },
                    })
                        .pipe((0, rxjs_1.timeout)(this.timeoutMs), (0, rxjs_1.catchError)((error) => {
                        this.logger.error(`LayerZero API error (attempt ${attempt}/${this.retryAttempts}):`, error.message);
                        throw error;
                    })));
                    return this.transformResponse(response.data, source, destination);
                }
                catch (error) {
                    if (attempt === this.retryAttempts) {
                        // Fallback to default values if API is unavailable
                        this.logger.warn('Using LayerZero fallback values');
                        return this.getFallbackFees(source, destination);
                    }
                    await this.delay(Math.pow(2, attempt) * 100);
                }
            }
            return this.getFallbackFees(source, destination);
        }
        transformResponse(data, sourceChain, destinationChain) {
            // LayerZero fees are typically in wei (18 decimals for ETH)
            return {
                baseFee: data.nativeFee || data.baseFee || '100000000000000',
                standardFee: data.nativeFee || data.standardFee || '150000000000000',
                priorityFee: data.priorityFee || '200000000000000',
                decimals: 18, // Most LayerZero fees are in native gas tokens (ETH-like)
                symbol: this.getSymbolForChain(sourceChain),
                sourceChain,
                destinationChain,
            };
        }
        getFallbackFees(sourceChain, destinationChain) {
            return {
                baseFee: '100000000000000', // 0.0001 ETH
                standardFee: '150000000000000', // 0.00015 ETH
                priorityFee: '200000000000000', // 0.0002 ETH
                decimals: 18,
                symbol: this.getSymbolForChain(sourceChain),
                sourceChain,
                destinationChain,
            };
        }
        getSymbolForChain(chain) {
            const symbols = {
                ethereum: 'ETH',
                arbitrum: 'ETH',
                optimism: 'ETH',
                polygon: 'MATIC',
                avalanche: 'AVAX',
                bsc: 'BNB',
            };
            return symbols[chain.toLowerCase()] || 'ETH';
        }
        delay(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }
    };
    __setFunctionName(_classThis, "LayerZeroAdapter");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        LayerZeroAdapter = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return LayerZeroAdapter = _classThis;
})();
exports.LayerZeroAdapter = LayerZeroAdapter;
//# sourceMappingURL=layerzero.adapter.js.map