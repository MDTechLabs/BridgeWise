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
exports.BridgeRegistry = void 0;
const common_1 = require("@nestjs/common");
const bridge_exceptions_1 = require("./bridge.exceptions");
let BridgeRegistry = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var BridgeRegistry = _classThis = class {
        constructor() {
            this.logger = new common_1.Logger(BridgeRegistry.name);
            this.adapters = new Map();
            this.allowOverwrite = false;
        }
        setOverwriteMode(allow) {
            this.allowOverwrite = allow;
        }
        /**
         * Register a bridge adapter.
         * Throws BridgeDuplicateException if already registered and allowOverwrite=false.
         */
        register(adapter, metadata) {
            if (this.adapters.has(adapter.name) && !this.allowOverwrite) {
                throw new bridge_exceptions_1.BridgeDuplicateException(adapter.name);
            }
            if (this.adapters.has(adapter.name)) {
                this.logger.warn(`Overwriting bridge adapter: "${adapter.name}"`);
            }
            this.adapters.set(adapter.name, {
                adapter,
                registeredAt: new Date(),
                metadata,
            });
            this.logger.log(`Registered bridge adapter: "${adapter.name}" v${adapter.version}`);
        }
        /**
         * Resolve a bridge by name.
         * Throws BridgeNotFoundException if not found.
         */
        get(name) {
            const entry = this.adapters.get(name);
            if (!entry) {
                throw new bridge_exceptions_1.BridgeNotFoundException(name);
            }
            return entry.adapter;
        }
        /**
         * Try to resolve a bridge by name without throwing.
         */
        tryGet(name) {
            return this.adapters.get(name)?.adapter;
        }
        /**
         * Resolve all bridges that have a given capability.
         */
        getByCapability(capabilityName) {
            const matches = Array.from(this.adapters.values())
                .map((entry) => entry.adapter)
                .filter((adapter) => adapter.capabilities.some((cap) => cap.name === capabilityName));
            if (matches.length === 0) {
                throw new bridge_exceptions_1.BridgeCapabilityNotFoundException(capabilityName);
            }
            return matches;
        }
        /**
         * List all registered bridge names.
         */
        list() {
            return Array.from(this.adapters.keys());
        }
        /**
         * List full registry entries with metadata.
         */
        listEntries() {
            return Array.from(this.adapters.values());
        }
        /**
         * Check whether a bridge is registered.
         */
        has(name) {
            return this.adapters.has(name);
        }
        /**
         * Unregister a bridge by name.
         */
        unregister(name) {
            const removed = this.adapters.delete(name);
            if (removed) {
                this.logger.log(`Unregistered bridge adapter: "${name}"`);
            }
            return removed;
        }
        /**
         * Clear all registered adapters.
         */
        clear() {
            this.adapters.clear();
            this.logger.log('Cleared all bridge adapters from registry');
        }
        /**
         * Return count of registered bridges.
         */
        get size() {
            return this.adapters.size;
        }
    };
    __setFunctionName(_classThis, "BridgeRegistry");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeRegistry = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeRegistry = _classThis;
})();
exports.BridgeRegistry = BridgeRegistry;
//# sourceMappingURL=bridge.registry.js.map