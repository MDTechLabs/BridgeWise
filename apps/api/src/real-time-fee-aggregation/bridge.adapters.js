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
exports.StargateAdapter = exports.HopAdapter = exports.AcrossAdapter = void 0;
const common_1 = require("@nestjs/common");
/**
 * Across Protocol Adapter
 * Typically fast with lower fees via optimistic relays.
 */
let AcrossAdapter = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AcrossAdapter = _classThis = class {
        constructor() {
            this.name = 'Across';
            this.SUPPORTED_ROUTES = [
                [1, 137, ['USDC', 'USDT', 'WETH', 'DAI']],
                [1, 42161, ['USDC', 'USDT', 'WETH']],
                [1, 10, ['USDC', 'USDT', 'WETH']],
                [137, 1, ['USDC', 'USDT', 'WETH']],
            ];
        }
        supportsRoute(fromChain, toChain, token) {
            return this.SUPPORTED_ROUTES.some(([from, to, tokens]) => from === fromChain && to === toChain && tokens.includes(token));
        }
        async getQuote(request) {
            // Simulate network call with realistic latency
            await this.simulateLatency(300, 800);
            const amount = parseFloat(request.amount);
            const feeRate = 0.0005; // 0.05%
            const relayerFee = amount * 0.001;
            const totalFeeUSD = amount * feeRate + relayerFee;
            const outputAmount = (amount - totalFeeUSD).toFixed(6);
            return {
                bridgeName: this.name,
                totalFeeUSD: parseFloat(totalFeeUSD.toFixed(4)),
                feeToken: request.token,
                estimatedArrivalTime: 120, // ~2 min via optimistic relay
                outputAmount,
                supported: true,
            };
        }
        simulateLatency(minMs, maxMs) {
            const delay = minMs + Math.random() * (maxMs - minMs);
            return new Promise((resolve) => setTimeout(resolve, delay));
        }
    };
    __setFunctionName(_classThis, "AcrossAdapter");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AcrossAdapter = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AcrossAdapter = _classThis;
})();
exports.AcrossAdapter = AcrossAdapter;
/**
 * Hop Protocol Adapter
 * AMM-based bridging, moderate speed and fees.
 */
let HopAdapter = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var HopAdapter = _classThis = class {
        constructor() {
            this.name = 'Hop';
            this.SUPPORTED_ROUTES = [
                [1, 137, ['USDC', 'USDT', 'DAI', 'MATIC']],
                [1, 42161, ['USDC', 'USDT', 'ETH']],
                [1, 10, ['USDC', 'USDT', 'ETH', 'SNX']],
                [137, 42161, ['USDC', 'USDT']],
            ];
        }
        supportsRoute(fromChain, toChain, token) {
            return this.SUPPORTED_ROUTES.some(([from, to, tokens]) => from === fromChain && to === toChain && tokens.includes(token));
        }
        async getQuote(request) {
            await this.simulateLatency(400, 1000);
            const amount = parseFloat(request.amount);
            const lpFee = amount * 0.001; // 0.1% LP fee
            const bonderFee = amount * 0.0015;
            const gasCost = 2.5; // USD
            const totalFeeUSD = lpFee + bonderFee + gasCost;
            const outputAmount = (amount - totalFeeUSD).toFixed(6);
            return {
                bridgeName: this.name,
                totalFeeUSD: parseFloat(totalFeeUSD.toFixed(4)),
                feeToken: request.token,
                estimatedArrivalTime: 300, // ~5 min
                outputAmount,
                supported: true,
            };
        }
        simulateLatency(minMs, maxMs) {
            const delay = minMs + Math.random() * (maxMs - minMs);
            return new Promise((resolve) => setTimeout(resolve, delay));
        }
    };
    __setFunctionName(_classThis, "HopAdapter");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        HopAdapter = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return HopAdapter = _classThis;
})();
exports.HopAdapter = HopAdapter;
/**
 * Stargate (LayerZero) Adapter
 * Deep liquidity pools, good for large amounts.
 */
let StargateAdapter = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StargateAdapter = _classThis = class {
        constructor() {
            this.name = 'Stargate';
            this.SUPPORTED_ROUTES = [
                [1, 137, ['USDC', 'USDT']],
                [1, 42161, ['USDC', 'USDT', 'ETH']],
                [1, 43114, ['USDC', 'USDT']],
                [137, 43114, ['USDC']],
                [42161, 10, ['USDC', 'ETH']],
            ];
        }
        supportsRoute(fromChain, toChain, token) {
            return this.SUPPORTED_ROUTES.some(([from, to, tokens]) => from === fromChain && to === toChain && tokens.includes(token));
        }
        async getQuote(request) {
            await this.simulateLatency(500, 1200);
            const amount = parseFloat(request.amount);
            const protocolFee = amount * 0.0006; // 0.06%
            const lzFee = 1.8; // LayerZero messaging fee in USD
            const totalFeeUSD = protocolFee + lzFee;
            const outputAmount = (amount - totalFeeUSD).toFixed(6);
            return {
                bridgeName: this.name,
                totalFeeUSD: parseFloat(totalFeeUSD.toFixed(4)),
                feeToken: request.token,
                estimatedArrivalTime: 600, // ~10 min
                outputAmount,
                supported: true,
            };
        }
        simulateLatency(minMs, maxMs) {
            const delay = minMs + Math.random() * (maxMs - minMs);
            return new Promise((resolve) => setTimeout(resolve, delay));
        }
    };
    __setFunctionName(_classThis, "StargateAdapter");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        StargateAdapter = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return StargateAdapter = _classThis;
})();
exports.StargateAdapter = StargateAdapter;
//# sourceMappingURL=bridge.adapters.js.map