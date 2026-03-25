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
exports.HopModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const hop_adapter_1 = require("./adapters/hop.adapter");
const hop_service_1 = require("./hop.service");
const config_module_1 = require("../config/config.module");
/**
 * STEP 15: Creating the Hop Module
 * =================================
 *
 * In NestJS, a "Module" is like a container that groups related code together.
 * Think of it like organizing your closet:
 * - All your shirts go in one drawer
 * - All your pants go in another drawer
 * - This module is the "Hop Protocol drawer"
 *
 * What does this module do?
 * 1. Imports dependencies (HttpModule for making API calls, ConfigModule for settings)
 * 2. Provides services (HopAdapter and HopService)
 * 3. Exports services (makes them available to other parts of the app)
 *
 * Why do we need a module?
 * - Keeps code organized
 * - Makes dependencies clear
 * - Enables dependency injection (NestJS automatically creates and injects instances)
 * - Makes testing easier (we can test this module in isolation)
 */
let HopModule = (() => {
    let _classDecorators = [(0, common_1.Module)({
            /**
             * IMPORTS: Other modules we depend on
             * ====================================
             *
             * - HttpModule: Provides HttpService for making HTTP requests to Hop API
             * - ConfigModule: Provides ConfigService for accessing environment variables
             */
            imports: [
                axios_1.HttpModule.register({
                    timeout: 10000, // 10 second timeout for HTTP requests
                    maxRedirects: 5, // Follow up to 5 redirects
                }),
                config_module_1.ConfigModule,
            ],
            /**
             * PROVIDERS: Services this module creates
             * ========================================
             *
             * These are the "workers" of our module.
             * NestJS will create one instance of each and manage their lifecycle.
             *
             * - HopService: Handles route/fee normalization and caching
             * - HopAdapter: Handles communication with Hop API
             */
            providers: [hop_service_1.HopService, hop_adapter_1.HopAdapter],
            /**
             * EXPORTS: Services we make available to other modules
             * =====================================================
             *
             * Other modules can import HopModule and use these services.
             *
             * Example:
             * ```typescript
             * @Module({
             *   imports: [HopModule],
             * })
             * export class SomeOtherModule {
             *   constructor(private hopAdapter: HopAdapter) {}
             * }
             * ```
             */
            exports: [hop_service_1.HopService, hop_adapter_1.HopAdapter],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var HopModule = _classThis = class {
    };
    __setFunctionName(_classThis, "HopModule");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        HopModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return HopModule = _classThis;
})();
exports.HopModule = HopModule;
//# sourceMappingURL=hop.module.js.map