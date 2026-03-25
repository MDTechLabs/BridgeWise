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
exports.ConfigService = void 0;
const common_1 = require("@nestjs/common");
let ConfigService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ConfigService = _classThis = class {
        constructor() {
            this.logger = new common_1.Logger(ConfigService.name);
            this.config = this.createConfig();
            this.validateConfig();
        }
        createConfig() {
            const nodeEnv = (process.env.NODE_ENV || 'development');
            const baseConfig = {
                nodeEnv,
                database: {
                    host: process.env.DB_HOST || 'localhost',
                    port: parseInt(process.env.DB_PORT || '5432', 10),
                    username: process.env.DB_USERNAME || 'postgres',
                    password: process.env.DB_PASSWORD || '',
                    database: process.env.DB_NAME || 'bridgewise',
                    ssl: nodeEnv === 'production' ? process.env.DB_SSL === 'true' : false,
                },
                rpc: {
                    ethereum: process.env.RPC_ETHEREUM ||
                        'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
                    polygon: process.env.RPC_POLYGON || 'https://polygon-rpc.com',
                    bsc: process.env.RPC_BSC || 'https://bsc-dataseed.binance.org',
                    arbitrum: process.env.RPC_ARBITRUM || 'https://arb1.arbitrum.io/rpc',
                    optimism: process.env.RPC_OPTIMISM || 'https://mainnet.optimism.io',
                },
                api: {
                    apiKey: process.env.API_KEY || '',
                    apiSecret: process.env.API_SECRET,
                    baseUrl: process.env.API_BASE_URL || 'https://api.bridgewise.com',
                    timeout: parseInt(process.env.API_TIMEOUT || '30000', 10),
                },
                server: {
                    port: parseInt(process.env.PORT || '3000', 10),
                    host: process.env.HOST || '0.0.0.0',
                    cors: {
                        origin: this.parseCorsOrigins(process.env.CORS_ORIGIN || 'http://localhost:3000'),
                        credentials: process.env.CORS_CREDENTIALS === 'true',
                    },
                },
                logging: {
                    level: (process.env.LOG_LEVEL || 'info'),
                    format: (process.env.LOG_FORMAT || 'simple'),
                },
            };
            return this.applyEnvironmentOverrides(baseConfig, nodeEnv);
        }
        applyEnvironmentOverrides(baseConfig, env) {
            const overrides = this.getEnvironmentOverrides(env);
            return this.mergeConfigs(baseConfig, overrides);
        }
        getEnvironmentOverrides(env) {
            switch (env) {
                case 'development':
                    return {
                        logging: {
                            level: 'debug',
                            format: 'simple',
                        },
                    };
                case 'staging':
                    return {
                        logging: {
                            level: 'info',
                            format: 'json',
                        },
                    };
                case 'production':
                    return {
                        logging: {
                            level: 'warn',
                            format: 'json',
                        },
                    };
                default:
                    return {};
            }
        }
        mergeConfigs(base, overrides) {
            return {
                ...base,
                ...overrides,
                database: { ...base.database, ...overrides.database },
                rpc: { ...base.rpc, ...overrides.rpc },
                api: { ...base.api, ...overrides.api },
                server: {
                    ...base.server,
                    ...overrides.server,
                    cors: { ...base.server.cors, ...overrides.server?.cors },
                },
                logging: { ...base.logging, ...overrides.logging },
            };
        }
        parseCorsOrigins(origins) {
            if (origins === '*')
                return '*';
            return origins.split(',').map((origin) => origin.trim());
        }
        validateConfig() {
            const requiredFields = [
                { key: 'API_KEY', value: this.config.api.apiKey },
                { key: 'DB_PASSWORD', value: this.config.database.password },
            ];
            const missing = requiredFields.filter((field) => !field.value);
            if (missing.length > 0) {
                this.logger.warn(`Missing recommended environment variables: ${missing.map((f) => f.key).join(', ')}`);
            }
            if (this.config.nodeEnv === 'production') {
                const productionRequired = [
                    { key: 'API_KEY', value: this.config.api.apiKey },
                    { key: 'DB_PASSWORD', value: this.config.database.password },
                ];
                const missingProduction = productionRequired.filter((field) => !field.value);
                if (missingProduction.length > 0) {
                    throw new Error(`Missing required environment variables for production: ${missingProduction.map((f) => f.key).join(', ')}`);
                }
            }
        }
        get(key) {
            return this.config[key];
        }
        get all() {
            return { ...this.config };
        }
        get isDevelopment() {
            return this.config.nodeEnv === 'development';
        }
        get isStaging() {
            return this.config.nodeEnv === 'staging';
        }
        get isProduction() {
            return this.config.nodeEnv === 'production';
        }
    };
    __setFunctionName(_classThis, "ConfigService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ConfigService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ConfigService = _classThis;
})();
exports.ConfigService = ConfigService;
//# sourceMappingURL=config.service.js.map