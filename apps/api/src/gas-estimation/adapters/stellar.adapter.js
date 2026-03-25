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
exports.StellarAdapter = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
let StellarAdapter = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StellarAdapter = _classThis = class {
        constructor(httpService, configService) {
            this.httpService = httpService;
            this.configService = configService;
            this.logger = new common_1.Logger(StellarAdapter.name);
            this.baseUrl = this.configService.get('STELLAR_API_URL', 'https://horizon.stellar.org');
            this.timeoutMs = this.configService.get('ADAPTER_TIMEOUT', 5000);
            this.retryAttempts = this.configService.get('ADAPTER_RETRY', 3);
        }
        async getFees() {
            for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
                try {
                    const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.baseUrl}/fee_stats`).pipe((0, rxjs_1.timeout)(this.timeoutMs), (0, rxjs_1.catchError)((error) => {
                        this.logger.error(`Stellar API error (attempt ${attempt}/${this.retryAttempts}):`, error.message);
                        throw error;
                    })));
                    return this.transformResponse(response.data);
                }
                catch (error) {
                    if (attempt === this.retryAttempts) {
                        throw new Error(`Stellar provider unavailable after ${this.retryAttempts} attempts: ${error.message}`);
                    }
                    // Exponential backoff
                    await this.delay(Math.pow(2, attempt) * 100);
                }
            }
            throw new Error('Stellar provider unavailable');
        }
        transformResponse(data) {
            // Stellar returns fees in stroops (1 XLM = 10,000,000 stroops)
            return {
                min: data.min_accepted_fee || '100',
                mode: data.mode_accepted_fee || '100',
                p10: data.p10_accepted_fee || '100',
                p20: data.p20_accepted_fee || '100',
                p30: data.p30_accepted_fee || '100',
                p40: data.p40_accepted_fee || '100',
                p50: data.p50_accepted_fee || '100',
                p60: data.p60_accepted_fee || '100',
                p70: data.p70_accepted_fee || '100',
                p80: data.p80_accepted_fee || '100',
                p90: data.p90_accepted_fee || '100',
                p95: data.p95_accepted_fee || '100',
                p99: data.p99_accepted_fee || '100',
                decimals: 7, // Stellar uses 7 decimal places (stroops)
                symbol: 'XLM',
            };
        }
        delay(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }
    };
    __setFunctionName(_classThis, "StellarAdapter");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        StellarAdapter = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return StellarAdapter = _classThis;
})();
exports.StellarAdapter = StellarAdapter;
//# sourceMappingURL=stellar.adapter.js.map