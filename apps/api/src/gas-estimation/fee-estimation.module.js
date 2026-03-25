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
exports.FeeEstimationModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const fee_estimation_controller_1 = require("./fee-estimation.controller");
const fee_estimation_service_1 = require("./fee-estimation.service");
const token_service_1 = require("./token.service");
const stellar_adapter_1 = require("./adapters/stellar.adapter");
const layerzero_adapter_1 = require("./adapters/layerzero.adapter");
const hop_adapter_1 = require("./adapters/hop.adapter");
const audit_logger_service_1 = require("../common/logger/audit-logger.service");
let FeeEstimationModule = (() => {
    let _classDecorators = [(0, common_1.Module)({
            imports: [
                axios_1.HttpModule.register({
                    timeout: 5000,
                    maxRedirects: 5,
                }),
                config_1.ConfigModule.forRoot({
                    isGlobal: true,
                }),
            ],
            controllers: [fee_estimation_controller_1.FeeEstimationController],
            providers: [
                fee_estimation_service_1.FeeEstimationService,
                token_service_1.TokenService,
                stellar_adapter_1.StellarAdapter,
                layerzero_adapter_1.LayerZeroAdapter,
                hop_adapter_1.HopAdapter,
                audit_logger_service_1.AuditLoggerService,
            ],
            exports: [fee_estimation_service_1.FeeEstimationService],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FeeEstimationModule = _classThis = class {
    };
    __setFunctionName(_classThis, "FeeEstimationModule");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FeeEstimationModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FeeEstimationModule = _classThis;
})();
exports.FeeEstimationModule = FeeEstimationModule;
//# sourceMappingURL=fee-estimation.module.js.map