"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HopAdapter = void 0;
const axios_1 = __importDefault(require("axios"));
const base_1 = require("./base");
/**
 * Hop Protocol bridge adapter
 * Documentation: https://docs.hop.exchange/developer-docs/api/api
 */
class HopAdapter extends base_1.BaseBridgeAdapter {
    constructor(apiBaseUrl = 'https://api.hop.exchange') {
        super();
        this.provider = 'hop';
        // Chain mapping for Hop Protocol
        this.chainMap = {
            ethereum: 'ethereum',
            polygon: 'polygon',
            arbitrum: 'arbitrum',
            optimism: 'optimism',
            base: 'base',
            gnosis: 'gnosis',
            nova: 'nova',
            stellar: null,
            bsc: null,
            avalanche: null,
        };
        this.apiClient = axios_1.default.create({
            baseURL: apiBaseUrl,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    getName() {
        return 'Hop Protocol';
    }
    supportsChainPair(sourceChain, targetChain) {
        const source = this.chainMap[sourceChain];
        const target = this.chainMap[targetChain];
        return source !== null && target !== null && source !== target;
    }
    async fetchRoutes(request) {
        if (!this.supportsChainPair(request.sourceChain, request.targetChain)) {
            return [];
        }
        const sourceChain = this.chainMap[request.sourceChain];
        const targetChain = this.chainMap[request.targetChain];
        try {
            // Hop API requires token address, defaulting to native token if not provided
            const token = request.tokenAddress || 'native';
            const slippage = request.slippageTolerance || 0.5;
            const response = await this.apiClient.get('/v1/quote', {
                params: {
                    amount: request.assetAmount,
                    token,
                    fromChain: sourceChain,
                    toChain: targetChain,
                    slippage,
                    network: 'mainnet', // Could be made configurable
                },
            });
            const quote = response.data;
            if (!quote || typeof quote.amountOutMin !== 'string') {
                return [];
            }
            // Calculate estimated received amount
            const estimatedReceived = quote.estimatedReceived || quote.amountOutMin;
            const bonderFee = quote.bonderFee || '0';
            // Calculate output amount (estimated received)
            const outputAmount = BigInt(estimatedReceived).toString();
            const inputAmount = BigInt(request.assetAmount);
            const fee = BigInt(bonderFee);
            // Estimate time: Hop typically takes 2-5 minutes for L2->L2, 10-20 minutes for L1->L2
            const estimatedTime = this.estimateBridgeTime(sourceChain);
            const route = {
                id: this.generateRouteId(this.provider, request.sourceChain, request.targetChain, 0),
                provider: this.provider,
                sourceChain: request.sourceChain,
                targetChain: request.targetChain,
                inputAmount: inputAmount.toString(),
                outputAmount,
                fee: fee.toString(),
                feePercentage: this.calculateFeePercentage(inputAmount.toString(), outputAmount),
                reliability: 0.98,
                estimatedTime,
                minAmountOut: quote.amountOutMin || outputAmount,
                maxAmountOut: estimatedReceived,
                deadline: quote.deadline ? parseInt(quote.deadline) : undefined,
                transactionData: {
                    gasEstimate: quote.gasEstimate,
                },
                metadata: {
                    description: `Bridge via Hop Protocol from ${sourceChain} to ${targetChain}`,
                    riskLevel: 2, // Hop is generally considered safe
                    bonderFee: bonderFee,
                    estimatedReceived: estimatedReceived,
                },
            };
            return [route];
        }
        catch (error) {
            // Log error but don't throw - return empty array to allow other providers to respond
            if (error instanceof Error) {
                console.error(`[HopAdapter] Error fetching routes:`, error.message);
            }
            return [];
        }
    }
    /**
     * Estimate bridge time based on chain pair
     */
    estimateBridgeTime(sourceChain) {
        const isL1 = sourceChain === 'ethereum';
        const isL2 = [
            'polygon',
            'arbitrum',
            'optimism',
            'base',
            'gnosis',
            'nova',
        ].includes(sourceChain);
        if (isL1) {
            // L1 -> L2: 10-20 minutes
            return 15 * 60;
        }
        else if (isL2) {
            // L2 -> L2: 2-5 minutes
            return 3 * 60;
        }
        // Default: 5 minutes
        return 5 * 60;
    }
}
exports.HopAdapter = HopAdapter;
//# sourceMappingURL=hop.js.map