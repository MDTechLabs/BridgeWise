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
exports.BridgeService = void 0;
const common_1 = require("@nestjs/common");
let BridgeService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var BridgeService = _classThis = class {
        constructor(registry, loader) {
            this.registry = registry;
            this.loader = loader;
        }
        /**
         * Execute an operation on a named bridge.
         */
        async execute(bridgeName, operation, payload) {
            const adapter = this.registry.get(bridgeName);
            return adapter.execute(operation, payload);
        }
        /**
         * Execute an operation on all bridges with a given capability.
         */
        async executeByCapability(capability, operation, payload) {
            const adapters = this.registry.getByCapability(capability);
            return Promise.all(adapters.map((a) => a.execute(operation, payload)));
        }
        /**
         * Register a bridge adapter at runtime (plugin injection).
         */
        async registerBridge(adapter, options) {
            await this.loader.registerAdapter(adapter, options);
        }
        /**
         * Load a bridge from a file path at runtime.
         */
        async loadBridgeFromFile(filePath) {
            return this.loader.loadAdapterFromFile(filePath);
        }
        /**
         * Check if a bridge is available.
         */
        hasBridge(name) {
            return this.registry.has(name);
        }
        /**
         * List all registered bridge names.
         */
        listBridges() {
            return this.registry.list();
        }
        /**
         * Get a bridge adapter directly.
         */
        getBridge(name) {
            return this.registry.get(name);
        }
        /**
         * Attempt to get a bridge without throwing.
         */
        tryGetBridge(name) {
            return this.registry.tryGet(name);
        }
        /**
         * Health check for all registered bridges.
         */
        async healthCheck() {
            const results = {};
            for (const name of this.registry.list()) {
                try {
                    results[name] = await this.registry.get(name).isHealthy();
                }
                catch {
                    results[name] = false;
                }
            }
            return results;
        }
        /**
         * Gracefully shutdown all bridge adapters.
         */
        async shutdownAll() {
            for (const name of this.registry.list()) {
                try {
                    await this.registry.get(name).shutdown();
                }
                catch {
                    // best-effort shutdown
                }
            }
        }
    };
    __setFunctionName(_classThis, "BridgeService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeService = _classThis;
})();
exports.BridgeService = BridgeService;
//# sourceMappingURL=bridge.service.js.map