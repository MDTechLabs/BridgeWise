"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeLoader = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const bridge_exceptions_1 = require("./bridge.exceptions");
const bridge_decorators_1 = require("./bridge.decorators");
let BridgeLoader = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var BridgeLoader = _classThis = class {
        constructor(registry, config) {
            this.registry = registry;
            this.config = config;
            this.logger = new common_1.Logger(BridgeLoader.name);
        }
        async onModuleInit() {
            this.registry.setOverwriteMode(this.config.allowOverwrite ?? false);
            if (this.config.autoDiscover && this.config.bridgesDirectory) {
                await this.loadFromDirectory(this.config.bridgesDirectory);
            }
            if (this.config.bridges) {
                await this.loadFromConfig(this.config.bridges);
            }
        }
        /**
         * Scan a directory for bridge adapter modules and auto-register them.
         */
        async loadFromDirectory(directory) {
            const resolvedDir = path.isAbsolute(directory)
                ? directory
                : path.join(process.cwd(), directory);
            if (!fs.existsSync(resolvedDir)) {
                this.logger.warn(`Bridge directory not found: "${resolvedDir}". Skipping auto-discovery.`);
                return;
            }
            const files = fs
                .readdirSync(resolvedDir)
                .filter((f) => (f.endsWith('.adapter.ts') || f.endsWith('.adapter.js')) &&
                !f.endsWith('.spec.ts'));
            this.logger.log(`Discovered ${files.length} bridge file(s) in "${resolvedDir}"`);
            for (const file of files) {
                const filePath = path.join(resolvedDir, file);
                await this.loadAdapterFromFile(filePath);
            }
        }
        /**
         * Load a single bridge adapter from a file path.
         */
        async loadAdapterFromFile(filePath) {
            try {
                const mod = await Promise.resolve(`${filePath}`).then(s => __importStar(require(s)));
                const AdapterClass = this.extractAdapterClass(mod);
                if (!AdapterClass) {
                    this.logger.warn(`No valid BridgeAdapter export found in "${filePath}". Skipping.`);
                    return null;
                }
                const instance = await this.createAndRegisterAdapter(AdapterClass, filePath);
                return instance;
            }
            catch (err) {
                throw new bridge_exceptions_1.BridgeLoadException(filePath, err);
            }
        }
        /**
         * Load bridges defined in the configuration object.
         */
        async loadFromConfig(bridgesConfig) {
            if (!bridgesConfig)
                return;
            for (const [name, adapterConfig] of Object.entries(bridgesConfig)) {
                if (adapterConfig.enabled === false) {
                    this.logger.log(`Bridge "${name}" is disabled via config. Skipping.`);
                    continue;
                }
                if (!adapterConfig.modulePath) {
                    this.logger.warn(`Bridge "${name}" has no modulePath. Skipping.`);
                    continue;
                }
                const resolvedPath = path.isAbsolute(adapterConfig.modulePath)
                    ? adapterConfig.modulePath
                    : path.join(process.cwd(), adapterConfig.modulePath);
                try {
                    const mod = await Promise.resolve(`${resolvedPath}`).then(s => __importStar(require(s)));
                    const AdapterClass = this.extractAdapterClass(mod);
                    if (!AdapterClass) {
                        this.logger.warn(`No valid BridgeAdapter export found for "${name}". Skipping.`);
                        continue;
                    }
                    await this.createAndRegisterAdapter(AdapterClass, resolvedPath, adapterConfig.options ?? {}, name);
                }
                catch (err) {
                    throw new bridge_exceptions_1.BridgeLoadException(resolvedPath, err);
                }
            }
        }
        /**
         * Programmatically register a pre-instantiated adapter at runtime.
         */
        async registerAdapter(adapter, options) {
            await this.initializeAdapter(adapter);
            this.registry.register(adapter, {
                ...options,
                source: 'runtime-injection',
            });
        }
        // ─── Private helpers ────────────────────────────────────────────────────────
        resolvePath(filePath) {
            return path.isAbsolute(filePath)
                ? filePath
                : path.join(process.cwd(), filePath);
        }
        async createAndRegisterAdapter(AdapterClass, source, extraConfig = {}, configKey) {
            const mergedConfig = {
                ...(this.config.globalConfig ?? {}),
                ...extraConfig,
            };
            const instance = new AdapterClass(mergedConfig);
            await this.initializeAdapter(instance);
            this.registry.register(instance, { source, configKey });
            return instance;
        }
        extractAdapterClass(mod) {
            // Check default export
            if (mod.default && this.isAdapterClass(mod.default)) {
                return mod.default;
            }
            // Check named exports
            for (const key of Object.keys(mod)) {
                if (this.isAdapterClass(mod[key])) {
                    return mod[key];
                }
            }
            return null;
        }
        isAdapterClass(value) {
            if (typeof value !== 'function')
                return false;
            // Check for @BridgePlugin decorator metadata
            if (Reflect.hasMetadata(bridge_decorators_1.BRIDGE_ADAPTER_METADATA, value))
                return true;
            // Duck-type check: prototype must have required BridgeAdapter methods
            const proto = value.prototype;
            if (!proto)
                return false;
            return (typeof proto['initialize'] === 'function' &&
                typeof proto['execute'] === 'function' &&
                typeof proto['isHealthy'] === 'function' &&
                typeof proto['shutdown'] === 'function');
        }
        async initializeAdapter(adapter) {
            try {
                await adapter.initialize(this.config.globalConfig);
                this.logger.log(`Initialized bridge adapter: "${adapter.name}"`);
            }
            catch (err) {
                throw new bridge_exceptions_1.BridgeInitializationException(adapter.name, err);
            }
        }
    };
    __setFunctionName(_classThis, "BridgeLoader");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BridgeLoader = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BridgeLoader = _classThis;
})();
exports.BridgeLoader = BridgeLoader;
//# sourceMappingURL=bridge.loader.js.map