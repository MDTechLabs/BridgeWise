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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NormalizedQuoteDto = exports.CompareQuotesResponseDto = exports.GetQuotesDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
let GetQuotesDto = (() => {
    var _a;
    let _fromChain_decorators;
    let _fromChain_initializers = [];
    let _fromChain_extraInitializers = [];
    let _toChain_decorators;
    let _toChain_initializers = [];
    let _toChain_extraInitializers = [];
    let _token_decorators;
    let _token_initializers = [];
    let _token_extraInitializers = [];
    let _amount_decorators;
    let _amount_initializers = [];
    let _amount_extraInitializers = [];
    let _rankBy_decorators;
    let _rankBy_initializers = [];
    let _rankBy_extraInitializers = [];
    return _a = class GetQuotesDto {
            constructor() {
                this.fromChain = __runInitializers(this, _fromChain_initializers, void 0);
                this.toChain = (__runInitializers(this, _fromChain_extraInitializers), __runInitializers(this, _toChain_initializers, void 0));
                this.token = (__runInitializers(this, _toChain_extraInitializers), __runInitializers(this, _token_initializers, void 0));
                this.amount = (__runInitializers(this, _token_extraInitializers), __runInitializers(this, _amount_initializers, void 0));
                this.rankBy = (__runInitializers(this, _amount_extraInitializers), __runInitializers(this, _rankBy_initializers, 'score'));
                __runInitializers(this, _rankBy_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _fromChain_decorators = [(0, swagger_1.ApiProperty)({ example: 1, description: 'Source chain ID' }), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(1)];
            _toChain_decorators = [(0, swagger_1.ApiProperty)({ example: 137, description: 'Destination chain ID' }), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(1)];
            _token_decorators = [(0, swagger_1.ApiProperty)({ example: 'USDC', description: 'Token symbol to bridge' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_transformer_1.Transform)(({ value }) => value?.toUpperCase())];
            _amount_decorators = [(0, swagger_1.ApiProperty)({
                    example: '1000',
                    description: 'Amount to bridge (in token units)',
                }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _rankBy_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    example: 'cost',
                    enum: ['cost', 'speed', 'score'],
                    description: 'Ranking strategy for results',
                }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(['cost', 'speed', 'score'])];
            __esDecorate(null, null, _fromChain_decorators, { kind: "field", name: "fromChain", static: false, private: false, access: { has: obj => "fromChain" in obj, get: obj => obj.fromChain, set: (obj, value) => { obj.fromChain = value; } }, metadata: _metadata }, _fromChain_initializers, _fromChain_extraInitializers);
            __esDecorate(null, null, _toChain_decorators, { kind: "field", name: "toChain", static: false, private: false, access: { has: obj => "toChain" in obj, get: obj => obj.toChain, set: (obj, value) => { obj.toChain = value; } }, metadata: _metadata }, _toChain_initializers, _toChain_extraInitializers);
            __esDecorate(null, null, _token_decorators, { kind: "field", name: "token", static: false, private: false, access: { has: obj => "token" in obj, get: obj => obj.token, set: (obj, value) => { obj.token = value; } }, metadata: _metadata }, _token_initializers, _token_extraInitializers);
            __esDecorate(null, null, _amount_decorators, { kind: "field", name: "amount", static: false, private: false, access: { has: obj => "amount" in obj, get: obj => obj.amount, set: (obj, value) => { obj.amount = value; } }, metadata: _metadata }, _amount_initializers, _amount_extraInitializers);
            __esDecorate(null, null, _rankBy_decorators, { kind: "field", name: "rankBy", static: false, private: false, access: { has: obj => "rankBy" in obj, get: obj => obj.rankBy, set: (obj, value) => { obj.rankBy = value; } }, metadata: _metadata }, _rankBy_initializers, _rankBy_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
exports.GetQuotesDto = GetQuotesDto;
class CompareQuotesResponseDto {
}
exports.CompareQuotesResponseDto = CompareQuotesResponseDto;
class NormalizedQuoteDto {
}
exports.NormalizedQuoteDto = NormalizedQuoteDto;
//# sourceMappingURL=get-quotes.dto.js.map