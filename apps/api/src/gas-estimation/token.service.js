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
exports.TokenService = void 0;
const common_1 = require("@nestjs/common");
const bignumber_js_1 = require("bignumber.js");
let TokenService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var TokenService = _classThis = class {
        /**
         * Normalize token amount to human-readable format
         * Handles different decimal places across networks
         */
        normalizeAmount(rawAmount, decimals) {
            try {
                const amount = new bignumber_js_1.BigNumber(rawAmount);
                const divisor = new bignumber_js_1.BigNumber(10).pow(decimals);
                const normalized = amount.dividedBy(divisor);
                // Format based on the size of the number
                if (normalized.isLessThan(0.000001)) {
                    return normalized.toFixed(decimals, bignumber_js_1.BigNumber.ROUND_UP);
                }
                else if (normalized.isLessThan(0.01)) {
                    return normalized.toFixed(6, bignumber_js_1.BigNumber.ROUND_UP);
                }
                else if (normalized.isLessThan(1)) {
                    return normalized.toFixed(4, bignumber_js_1.BigNumber.ROUND_UP);
                }
                else {
                    return normalized.toFixed(2, bignumber_js_1.BigNumber.ROUND_UP);
                }
            }
            catch (error) {
                return '0';
            }
        }
        /**
         * Convert normalized amount back to raw units
         */
        denormalizeAmount(normalizedAmount, decimals) {
            try {
                const amount = new bignumber_js_1.BigNumber(normalizedAmount);
                const multiplier = new bignumber_js_1.BigNumber(10).pow(decimals);
                return amount.multipliedBy(multiplier).toFixed(0);
            }
            catch (error) {
                return '0';
            }
        }
        /**
         * Convert between different token decimals
         */
        convertDecimals(amount, fromDecimals, toDecimals) {
            try {
                const normalized = this.normalizeAmount(amount, fromDecimals);
                return this.denormalizeAmount(normalized, toDecimals);
            }
            catch (error) {
                return '0';
            }
        }
        /**
         * Add amounts with different decimals
         */
        addAmounts(amount1, decimals1, amount2, decimals2, resultDecimals) {
            try {
                const normalized1 = new bignumber_js_1.BigNumber(amount1).dividedBy(new bignumber_js_1.BigNumber(10).pow(decimals1));
                const normalized2 = new bignumber_js_1.BigNumber(amount2).dividedBy(new bignumber_js_1.BigNumber(10).pow(decimals2));
                const sum = normalized1.plus(normalized2);
                return sum.multipliedBy(new bignumber_js_1.BigNumber(10).pow(resultDecimals)).toFixed(0);
            }
            catch (error) {
                return '0';
            }
        }
        /**
         * Format amount with currency symbol
         */
        formatWithSymbol(amount, symbol) {
            return `${amount} ${symbol}`;
        }
        /**
         * Calculate USD value if price is available
         */
        calculateUsdValue(amount, decimals, usdPrice) {
            try {
                const normalized = this.normalizeAmount(amount, decimals);
                const usdValue = new bignumber_js_1.BigNumber(normalized).multipliedBy(usdPrice);
                return usdValue.toFixed(2, bignumber_js_1.BigNumber.ROUND_DOWN);
            }
            catch (error) {
                return '0.00';
            }
        }
    };
    __setFunctionName(_classThis, "TokenService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        TokenService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return TokenService = _classThis;
})();
exports.TokenService = TokenService;
//# sourceMappingURL=token.service.js.map