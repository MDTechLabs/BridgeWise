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
exports.FeeEstimationController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const fees_interface_1 = require("./interfaces/fees.interface");
let FeeEstimationController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('Fee Estimation'), (0, common_1.Controller)('api/v1/fees')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getAllFees_decorators;
    let _getNetworkFee_decorators;
    let _healthCheck_decorators;
    var FeeEstimationController = _classThis = class {
        constructor(feeEstimationService) {
            this.feeEstimationService = (__runInitializers(this, _instanceExtraInitializers), feeEstimationService);
        }
        async getAllFees() {
            try {
                const fees = await this.feeEstimationService.getAllFeeEstimates();
                return {
                    success: true,
                    data: fees,
                };
            }
            catch (error) {
                throw new common_1.HttpException({
                    success: false,
                    error: 'Failed to fetch fee estimates',
                    details: error.message,
                }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
        async getNetworkFee(network) {
            if (!Object.values(fees_interface_1.NetworkType).includes(network)) {
                throw new common_1.HttpException({
                    success: false,
                    error: 'Invalid network',
                    supportedNetworks: Object.values(fees_interface_1.NetworkType),
                }, common_1.HttpStatus.BAD_REQUEST);
            }
            try {
                const fees = await this.feeEstimationService.getFeeEstimate(network);
                return {
                    success: true,
                    data: fees,
                };
            }
            catch (error) {
                throw new common_1.HttpException({
                    success: false,
                    error: `Failed to fetch fees for ${network}`,
                    details: error.message,
                }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
        async healthCheck() {
            const fees = await this.feeEstimationService.getAllFeeEstimates();
            return {
                success: true,
                healthy: fees.metadata.successfulProviders > 0,
                providers: {
                    total: fees.metadata.totalProviders,
                    available: fees.metadata.successfulProviders,
                    unavailable: fees.metadata.totalProviders - fees.metadata.successfulProviders,
                },
                networks: {
                    stellar: fees.networks.stellar.available,
                    layerzero: fees.networks.layerzero.available,
                    hop: fees.networks.hop.available,
                },
                timestamp: fees.timestamp,
            };
        }
    };
    __setFunctionName(_classThis, "FeeEstimationController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _getAllFees_decorators = [(0, common_1.Get)(), (0, swagger_1.ApiOperation)({
                summary: 'Get fee estimates for all supported networks',
                description: 'Retrieves current fee estimates from all supported blockchain networks (Stellar, LayerZero, and Hop Protocol). Results are cached for 10 seconds to optimize performance. This endpoint aggregates data from multiple fee estimation providers for each network.',
                externalDocs: {
                    url: 'https://docs.bridgewise.example.com/fee-estimation',
                    description: 'Fee Estimation Documentation',
                },
            }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'Fee estimates retrieved successfully',
                example: {
                    success: true,
                    data: {
                        timestamp: 1706526000000,
                        networks: {
                            stellar: {
                                network: 'stellar',
                                available: true,
                                fees: {
                                    slow: '100',
                                    standard: '150',
                                    fast: '200',
                                },
                                currency: 'stroops',
                                estimatedTime: {
                                    slow: 30000,
                                    standard: 15000,
                                    fast: 5000,
                                },
                                lastUpdated: 1706525990000,
                                additionalData: {
                                    baseFee: '100',
                                    medianFee: '150',
                                    percentiles: {
                                        p10: '110',
                                        p50: '150',
                                        p90: '180',
                                    },
                                },
                            },
                            layerzero: {
                                network: 'layerzero',
                                available: true,
                                fees: {
                                    slow: '0.5',
                                    standard: '0.75',
                                    fast: '1.0',
                                },
                                currency: 'GWEI',
                                estimatedTime: {
                                    slow: 20000,
                                    standard: 12000,
                                    fast: 3000,
                                },
                                lastUpdated: 1706525985000,
                            },
                            hop: {
                                network: 'hop',
                                available: true,
                                fees: {
                                    slow: '0.1',
                                    standard: '0.15',
                                    fast: '0.2',
                                },
                                currency: 'ETH',
                                estimatedTime: {
                                    slow: 25000,
                                    standard: 15000,
                                    fast: 5000,
                                },
                                lastUpdated: 1706525980000,
                                additionalData: {
                                    lpFee: '0.05',
                                    bonderFee: '0.08',
                                },
                            },
                        },
                        metadata: {
                            successfulProviders: 3,
                            totalProviders: 3,
                        },
                    },
                },
            }), (0, swagger_1.ApiResponse)({
                status: 500,
                description: 'Internal server error - fee estimation service unavailable',
                example: {
                    success: false,
                    error: 'Failed to fetch fee estimates',
                    details: 'Connection timeout to fee provider',
                },
            })];
        _getNetworkFee_decorators = [(0, common_1.Get)('network'), (0, swagger_1.ApiOperation)({
                summary: 'Get fee estimate for a specific network',
                description: 'Retrieves fee estimates for a single specified blockchain network. Supports Stellar, LayerZero, and Hop Protocol. Results are cached for 10 seconds. Adapter-specific fields vary by network.',
            }), (0, swagger_1.ApiQuery)({
                name: 'network',
                enum: fees_interface_1.NetworkType,
                description: 'Target blockchain network',
                example: 'stellar',
                required: true,
            }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'Fee estimate retrieved successfully',
                schema: {
                    oneOf: [
                        {
                            title: 'Stellar Fee Response',
                            type: 'object',
                            properties: {
                                success: { type: 'boolean' },
                                data: {
                                    type: 'object',
                                    properties: {
                                        network: { type: 'string', example: 'stellar' },
                                        available: { type: 'boolean' },
                                        fees: {
                                            type: 'object',
                                            properties: {
                                                slow: { type: 'string', example: '100' },
                                                standard: { type: 'string', example: '150' },
                                                fast: { type: 'string', example: '200' },
                                            },
                                        },
                                        currency: { type: 'string', example: 'stroops' },
                                        estimatedTime: {
                                            type: 'object',
                                            properties: {
                                                slow: { type: 'number', example: 30000 },
                                                standard: { type: 'number', example: 15000 },
                                                fast: { type: 'number', example: 5000 },
                                            },
                                        },
                                        additionalData: {
                                            type: 'object',
                                            properties: {
                                                baseFee: { type: 'string' },
                                                decimals: { type: 'number', example: 7 },
                                                symbol: { type: 'string', example: 'XLM' },
                                            },
                                            description: 'Stellar-specific adapter data',
                                        },
                                    },
                                },
                            },
                        },
                        {
                            title: 'LayerZero Fee Response',
                            type: 'object',
                            description: 'For network=layerzero. Includes cross-chain details.',
                            properties: {
                                additionalData: {
                                    type: 'object',
                                    properties: {
                                        sourceChain: { type: 'string', example: 'ethereum' },
                                        destinationChain: { type: 'string', example: 'polygon' },
                                    },
                                    description: 'LayerZero omnichain routing data',
                                },
                            },
                        },
                        {
                            title: 'Hop Fee Response',
                            type: 'object',
                            description: 'For network=hop. Includes bridge routing data.',
                            properties: {
                                additionalData: {
                                    type: 'object',
                                    properties: {
                                        token: { type: 'string', example: 'USDC' },
                                        sourceChain: { type: 'string', example: 'ethereum' },
                                        destinationChain: { type: 'string', example: 'polygon' },
                                        lpFee: {
                                            type: 'string',
                                            description: 'Liquidity provider fee',
                                        },
                                        bonderFee: { type: 'string', description: 'Bonder fee' },
                                    },
                                    description: 'Hop Protocol bridge-specific data',
                                },
                            },
                        },
                    ],
                },
            }), (0, swagger_1.ApiResponse)({
                status: 400,
                description: 'Invalid network parameter',
                example: {
                    success: false,
                    error: 'Invalid network',
                    supportedNetworks: ['stellar', 'layerzero', 'hop'],
                },
            }), (0, swagger_1.ApiResponse)({
                status: 500,
                description: 'Failed to fetch fees for specified network',
                example: {
                    success: false,
                    error: 'Failed to fetch fees for stellar',
                    details: 'Stellar RPC service temporarily unavailable',
                },
            })];
        _healthCheck_decorators = [(0, common_1.Get)('health'), (0, swagger_1.ApiOperation)({
                summary: 'Health check for fee estimation service',
                description: 'Verifies the health and availability of the fee estimation service and all underlying network adapters (Stellar, LayerZero, Hop). Useful for monitoring and diagnostics.',
            }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'Service health status retrieved successfully',
                example: {
                    success: true,
                    healthy: true,
                    providers: {
                        total: 3,
                        available: 3,
                        unavailable: 0,
                    },
                    networks: {
                        stellar: true,
                        layerzero: true,
                        hop: true,
                    },
                    timestamp: 1706526000000,
                },
            }), (0, swagger_1.ApiResponse)({
                status: 503,
                description: 'Service unhealthy - no providers available',
                example: {
                    success: true,
                    healthy: false,
                    providers: {
                        total: 3,
                        available: 0,
                        unavailable: 3,
                    },
                    networks: {
                        stellar: false,
                        layerzero: false,
                        hop: false,
                    },
                    timestamp: 1706526000000,
                },
            })];
        __esDecorate(_classThis, null, _getAllFees_decorators, { kind: "method", name: "getAllFees", static: false, private: false, access: { has: obj => "getAllFees" in obj, get: obj => obj.getAllFees }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getNetworkFee_decorators, { kind: "method", name: "getNetworkFee", static: false, private: false, access: { has: obj => "getNetworkFee" in obj, get: obj => obj.getNetworkFee }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _healthCheck_decorators, { kind: "method", name: "healthCheck", static: false, private: false, access: { has: obj => "healthCheck" in obj, get: obj => obj.healthCheck }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FeeEstimationController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FeeEstimationController = _classThis;
})();
exports.FeeEstimationController = FeeEstimationController;
//# sourceMappingURL=fee-estimation.controller.js.map