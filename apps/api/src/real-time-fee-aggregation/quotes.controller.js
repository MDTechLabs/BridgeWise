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
exports.QuotesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const get_quotes_dto_1 = require("./get-quotes.dto");
let QuotesController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('Bridge Quotes'), (0, common_1.Controller)('quotes')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _compareQuotes_decorators;
    var QuotesController = _classThis = class {
        constructor(aggregationService) {
            this.aggregationService = (__runInitializers(this, _instanceExtraInitializers), aggregationService);
            this.logger = new common_1.Logger(QuotesController.name);
        }
        async compareQuotes(query) {
            const dto = (0, class_transformer_1.plainToInstance)(get_quotes_dto_1.GetQuotesDto, query);
            const errors = await (0, class_validator_1.validate)(dto);
            if (errors.length > 0) {
                const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
                throw new common_1.BadRequestException(messages);
            }
            this.logger.log(`Comparing quotes: ${dto.token} ${dto.amount} from chain ${dto.fromChain} → ${dto.toChain} [rankBy=${dto.rankBy}]`);
            return this.aggregationService.compareQuotes({
                fromChain: dto.fromChain,
                toChain: dto.toChain,
                token: dto.token,
                amount: dto.amount,
            }, dto.rankBy);
        }
    };
    __setFunctionName(_classThis, "QuotesController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _compareQuotes_decorators = [(0, common_1.Get)('compare'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                summary: 'Compare live bridge quotes',
                description: 'Fetches and ranks real-time quotes from all registered bridge adapters for a given transfer request.',
            }), (0, swagger_1.ApiQuery)({ name: 'fromChain', type: Number, example: 1 }), (0, swagger_1.ApiQuery)({ name: 'toChain', type: Number, example: 137 }), (0, swagger_1.ApiQuery)({ name: 'token', type: String, example: 'USDC' }), (0, swagger_1.ApiQuery)({ name: 'amount', type: String, example: '1000' }), (0, swagger_1.ApiQuery)({
                name: 'rankBy',
                enum: ['cost', 'speed', 'score'],
                required: false,
                description: 'Ranking strategy (default: score)',
            }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'Ranked bridge quotes returned successfully',
                type: get_quotes_dto_1.CompareQuotesResponseDto,
            }), (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid query parameters' })];
        __esDecorate(_classThis, null, _compareQuotes_decorators, { kind: "method", name: "compareQuotes", static: false, private: false, access: { has: obj => "compareQuotes" in obj, get: obj => obj.compareQuotes }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QuotesController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QuotesController = _classThis;
})();
exports.QuotesController = QuotesController;
//# sourceMappingURL=quotes.controller.js.map