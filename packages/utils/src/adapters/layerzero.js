"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LayerZeroAdapter = void 0;
const axios_1 = __importDefault(require("axios"));
const base_1 = require("./base");
class LayerZeroAdapter extends base_1.BaseBridgeAdapter {
    constructor() {
        super();
        this.provider = LayerZeroAdapter.BridgeProviderEnum.LAYERZERO;
        this.scanApiClient = axios_1.default.create({
            baseURL: 'https://api.layerzeroscan.com',
            timeout: 10_000,
        });
    }
    getName() {
        return 'LayerZero';
    }
    supportsChainPair(from, to) {
        return from !== to;
    }
    async fetchRoutes(request) {
        const sourceEid = this.resolveEndpointId(request.sourceChain);
        const targetEid = this.resolveEndpointId(request.targetChain);
        return this.fetchRoutesFromScan(request, sourceEid, targetEid);
    }
    resolveEndpointId(chain) {
        const map = {
            ethereum: 30101,
            polygon: 30109,
            arbitrum: 30110,
            stellar: 0,
        };
        return map[chain] ?? 0;
    }
    async estimateFee(_sourceEid, _targetEid, assetAmount) {
        const amount = BigInt(assetAmount);
        return (amount / 1000n).toString();
    }
    estimateBridgeTime() {
        return 180;
    }
    calculateMinAmountOut(outputAmount, slippageTolerance) {
        const amount = BigInt(outputAmount);
        const slippage = BigInt(Math.floor((Number(amount) * slippageTolerance) / 100));
        return (amount - slippage).toString();
    }
    async fetchRoutesFromScan(request, sourceEid, targetEid) {
        try {
            const response = await this.scanApiClient.get('/messages/latest', {
                params: {
                    limit: 10,
                    srcEid: sourceEid,
                    dstEid: targetEid,
                },
            });
            const messages = response.data?.messages ?? [];
            if (!Array.isArray(messages) || messages.length === 0) {
                return [];
            }
            const estimatedFee = await this.estimateFee(sourceEid, targetEid, request.assetAmount);
            const inputAmount = BigInt(request.assetAmount);
            const fee = BigInt(estimatedFee);
            const outputAmount = inputAmount - fee;
            const route = {
                id: this.generateRouteId(this.provider, request.sourceChain, request.targetChain, 0),
                provider: this.provider,
                sourceChain: request.sourceChain,
                targetChain: request.targetChain,
                inputAmount: inputAmount.toString(),
                outputAmount: outputAmount.toString(),
                fee: fee.toString(),
                feePercentage: this.calculateFeePercentage(inputAmount.toString(), outputAmount.toString()),
                reliability: 0.92,
                estimatedTime: this.estimateBridgeTime(),
                minAmountOut: this.calculateMinAmountOut(outputAmount.toString(), request.slippageTolerance ?? 0),
                maxAmountOut: outputAmount.toString(),
                metadata: {
                    description: `Bridge via LayerZero`,
                    riskLevel: 2,
                    srcChainId: sourceEid,
                    dstChainId: targetEid,
                    estimated: true,
                },
            };
            return [route];
        }
        catch (error) {
            if (error instanceof Error) {
                console.error('[LayerZeroAdapter]', error.message);
            }
            return [];
        }
    }
}
exports.LayerZeroAdapter = LayerZeroAdapter;
// Runtime enum for BridgeProvider
LayerZeroAdapter.BridgeProviderEnum = {
    LAYERZERO: 'layerzero',
    HOP: 'hop',
    STELLAR: 'stellar',
};
//# sourceMappingURL=layerzero.js.map