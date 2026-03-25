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
exports.TransactionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const rxjs_1 = require("rxjs");
const create_transaction_dto_1 = require("./dto/create-transaction.dto");
const update_transaction_dto_1 = require("./dto/update-transaction.dto");
let TransactionController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('Transactions'), (0, common_1.Controller)('transactions')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _create_decorators;
    let _getTransaction_decorators;
    let _update_decorators;
    let _advanceStep_decorators;
    let _streamTransactionEvents_decorators;
    let _pollTransaction_decorators;
    var TransactionController = _classThis = class {
        constructor(transactionService, eventEmitter) {
            this.transactionService = (__runInitializers(this, _instanceExtraInitializers), transactionService);
            this.eventEmitter = eventEmitter;
        }
        async create(dto) {
            return this.transactionService.create(dto);
        }
        async getTransaction(id) {
            return this.transactionService.findById(id);
        }
        async update(id, dto) {
            return this.transactionService.update(id, dto);
        }
        async advanceStep(id, stepData) {
            return this.transactionService.advanceStep(id, stepData);
        }
        streamTransactionEvents(id) {
            return new rxjs_1.Observable((observer) => {
                const handler = (transaction) => {
                    if (transaction.id === id) {
                        observer.next({ data: transaction });
                    }
                };
                this.eventEmitter.on('transaction.updated', handler);
                // Send initial state
                this.transactionService.findById(id).then((transaction) => {
                    observer.next({ data: transaction });
                });
                return () => {
                    this.eventEmitter.off('transaction.updated', handler);
                };
            });
        }
        async pollTransaction(id) {
            return this.transactionService.findById(id);
        }
    };
    __setFunctionName(_classThis, "TransactionController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _create_decorators = [(0, common_1.Post)(), (0, swagger_1.ApiOperation)({
                summary: 'Create a new transaction',
                description: 'Initiates a new cross-chain transaction with the specified type and configuration. Supports multiple transaction types across different blockchain networks.',
            }), (0, swagger_1.ApiBody)({
                type: create_transaction_dto_1.CreateTransactionDto,
                description: 'Transaction creation payload',
                examples: {
                    stellar: {
                        summary: 'Create Stellar transaction',
                        value: {
                            type: 'stellar-payment',
                            metadata: {
                                sourceAccount: 'GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD',
                                destinationAccount: 'GBRPYHIL2CI3WHZSRJQEMQ5CPQIS2TCCQ7OXJGGUFR7XUWVEPSWR47U',
                                amount: '100',
                                asset: 'native',
                                memo: 'Cross-chain transfer',
                            },
                            totalSteps: 3,
                        },
                    },
                    hop: {
                        summary: 'Create Hop Protocol transaction',
                        value: {
                            type: 'hop-bridge',
                            metadata: {
                                token: 'USDC',
                                amount: '500',
                                sourceChain: 'ethereum',
                                destinationChain: 'polygon',
                                recipient: '0x742d35Cc6634C0532925a3b844Bc328e8f94D5dC',
                                deadline: 1000000000,
                                amountOutMin: '490',
                            },
                            totalSteps: 4,
                        },
                    },
                    layerzero: {
                        summary: 'Create LayerZero transaction',
                        value: {
                            type: 'layerzero-omnichain',
                            metadata: {
                                token: 'USDT',
                                amount: '1000',
                                sourceChainId: 101,
                                destinationChainId: 102,
                                recipient: '0x9e4c14403d7d2a8f5bD10b2c7c1e0d0e0d0e0d0e',
                            },
                            totalSteps: 3,
                        },
                    },
                },
            }), (0, swagger_1.ApiResponse)({
                status: 201,
                description: 'Transaction created successfully',
                example: {
                    id: 'txn_550e8400e29b41d4a716446655440000',
                    type: 'stellar-payment',
                    status: 'pending',
                    currentStep: 0,
                    totalSteps: 3,
                    metadata: {
                        sourceAccount: 'GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD',
                        destinationAccount: 'GBRPYHIL2CI3WHZSRJQEMQ5CPQIS2TCCQ7OXJGGUFR7XUWVEPSWR47U',
                    },
                    createdAt: '2026-01-29T10:00:00.000Z',
                },
            }), (0, swagger_1.ApiResponse)({
                status: 400,
                description: 'Invalid input - validation error on required fields',
                example: {
                    success: false,
                    error: 'Validation error',
                    details: [
                        {
                            field: 'type',
                            message: 'type must be a string',
                        },
                    ],
                },
            })];
        _getTransaction_decorators = [(0, common_1.Get)(':id'), (0, swagger_1.ApiOperation)({
                summary: 'Get transaction details',
                description: 'Retrieves the current state and details of a transaction by ID, including its current step, status, and metadata.',
            }), (0, swagger_1.ApiParam)({
                name: 'id',
                type: 'string',
                description: 'Unique transaction identifier',
                example: 'txn_550e8400e29b41d4a716446655440000',
            }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'Transaction details retrieved successfully',
                example: {
                    id: 'txn_550e8400e29b41d4a716446655440000',
                    type: 'stellar-payment',
                    status: 'in-progress',
                    currentStep: 1,
                    totalSteps: 3,
                    metadata: {
                        sourceAccount: 'GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD',
                        txHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                    },
                    state: {
                        validated: true,
                        submitted: true,
                    },
                    createdAt: '2026-01-29T10:00:00.000Z',
                    updatedAt: '2026-01-29T10:00:05.000Z',
                },
            }), (0, swagger_1.ApiResponse)({
                status: 404,
                description: 'Transaction not found',
                example: {
                    success: false,
                    error: 'Transaction not found',
                    details: 'No transaction with ID txn_invalid',
                },
            })];
        _update_decorators = [(0, common_1.Put)(':id'), (0, swagger_1.ApiOperation)({
                summary: 'Update transaction',
                description: 'Updates the transaction status, state, or other properties. Used for manual intervention and state corrections.',
            }), (0, swagger_1.ApiParam)({
                name: 'id',
                type: 'string',
                description: 'Unique transaction identifier',
                example: 'txn_550e8400e29b41d4a716446655440000',
            }), (0, swagger_1.ApiBody)({
                type: update_transaction_dto_1.UpdateTransactionDto,
                description: 'Fields to update',
                examples: {
                    statusUpdate: {
                        summary: 'Update status',
                        value: {
                            status: 'completed',
                        },
                    },
                    stateUpdate: {
                        summary: 'Update internal state',
                        value: {
                            state: {
                                validated: true,
                                submitted: true,
                                confirmed: true,
                            },
                        },
                    },
                },
            }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'Transaction updated successfully',
                example: {
                    id: 'txn_550e8400e29b41d4a716446655440000',
                    type: 'stellar-payment',
                    status: 'completed',
                    currentStep: 3,
                    totalSteps: 3,
                    updatedAt: '2026-01-29T10:00:15.000Z',
                },
            })];
        _advanceStep_decorators = [(0, common_1.Put)(':id/advance'), (0, swagger_1.ApiOperation)({
                summary: 'Advance transaction to next step',
                description: 'Moves the transaction to the next step in its workflow. Each step may require different data or validations.',
            }), (0, swagger_1.ApiParam)({
                name: 'id',
                type: 'string',
                description: 'Unique transaction identifier',
                example: 'txn_550e8400e29b41d4a716446655440000',
            }), (0, swagger_1.ApiBody)({
                type: Object,
                required: false,
                description: 'Step-specific data required for advancement',
                schema: {
                    type: 'object',
                    properties: {
                        signature: { type: 'string', description: 'Transaction signature' },
                        fee: { type: 'string', description: 'Transaction fee' },
                        gasLimit: { type: 'string', description: 'Gas limit for the step' },
                    },
                },
                examples: {
                    stellarSign: {
                        summary: 'Stellar signature step',
                        value: {
                            signature: 'TAQCSRX2RIDJNHFYFZXPGXWRWQUXNZKICH57C4YKHUYATFLBMUUPAA2DWS5PDVLXP6GQ6SDFGJJWMKHW',
                        },
                    },
                    hopFeeStep: {
                        summary: 'Hop fee estimation step',
                        value: {
                            fee: '1.5',
                            gasLimit: '200000',
                        },
                    },
                },
            }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'Transaction advanced to next step',
                example: {
                    id: 'txn_550e8400e29b41d4a716446655440000',
                    type: 'stellar-payment',
                    status: 'in-progress',
                    currentStep: 2,
                    totalSteps: 3,
                    updatedAt: '2026-01-29T10:00:10.000Z',
                },
            }), (0, swagger_1.ApiResponse)({
                status: 400,
                description: 'Cannot advance - step validation failed',
                example: {
                    success: false,
                    error: 'Step advancement failed',
                    details: 'Invalid signature provided',
                },
            })];
        _streamTransactionEvents_decorators = [(0, common_1.Sse)(':id/events'), (0, swagger_1.ApiOperation)({
                summary: 'Stream transaction updates (Server-Sent Events)',
                description: 'Establishes a real-time connection to receive transaction updates via Server-Sent Events. Ideal for monitoring transaction progress in real-time.',
            }), (0, swagger_1.ApiParam)({
                name: 'id',
                type: 'string',
                description: 'Unique transaction identifier',
                example: 'txn_550e8400e29b41d4a716446655440000',
            }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'SSE stream established. Events sent when transaction state changes.',
                content: {
                    'text/event-stream': {
                        schema: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Transaction ID' },
                                status: { type: 'string', description: 'Transaction status' },
                                currentStep: { type: 'number', description: 'Current step number' },
                                updatedAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'Last update timestamp',
                                },
                            },
                        },
                        example: 'data: {"id":"txn_550e8400e29b41d4a716446655440000","status":"in-progress","currentStep":1}\n\n',
                    },
                },
            })];
        _pollTransaction_decorators = [(0, common_1.Get)(':id/poll'), (0, swagger_1.ApiOperation)({
                summary: 'Poll transaction status (fallback to SSE)',
                description: 'Alternative to Server-Sent Events for polling transaction status. Returns the current transaction state. Use this if SSE is not supported by your client.',
            }), (0, swagger_1.ApiParam)({
                name: 'id',
                type: 'string',
                description: 'Unique transaction identifier',
                example: 'txn_550e8400e29b41d4a716446655440000',
            }), (0, swagger_1.ApiResponse)({
                status: 200,
                description: 'Transaction status retrieved',
                example: {
                    id: 'txn_550e8400e29b41d4a716446655440000',
                    type: 'stellar-payment',
                    status: 'in-progress',
                    currentStep: 1,
                    totalSteps: 3,
                    updatedAt: '2026-01-29T10:00:10.000Z',
                },
            })];
        __esDecorate(_classThis, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getTransaction_decorators, { kind: "method", name: "getTransaction", static: false, private: false, access: { has: obj => "getTransaction" in obj, get: obj => obj.getTransaction }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _advanceStep_decorators, { kind: "method", name: "advanceStep", static: false, private: false, access: { has: obj => "advanceStep" in obj, get: obj => obj.advanceStep }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _streamTransactionEvents_decorators, { kind: "method", name: "streamTransactionEvents", static: false, private: false, access: { has: obj => "streamTransactionEvents" in obj, get: obj => obj.streamTransactionEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _pollTransaction_decorators, { kind: "method", name: "pollTransaction", static: false, private: false, access: { has: obj => "pollTransaction" in obj, get: obj => obj.pollTransaction }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        TransactionController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return TransactionController = _classThis;
})();
exports.TransactionController = TransactionController;
//# sourceMappingURL=transactions.controller.js.map