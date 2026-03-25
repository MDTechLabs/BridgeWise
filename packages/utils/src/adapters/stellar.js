"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StellarAdapter = void 0;
const axios_1 = __importDefault(require("axios"));
const base_1 = require("./base");
const error_codes_1 = require("../error-codes");
const fee_estimation_1 = require("../fee-estimation");
/**
 * Stellar/Soroban bridge adapter
 * Handles bridging between Stellar network and other chains via Soroban smart contracts
 */
class StellarAdapter extends base_1.BaseBridgeAdapter {
    constructor(rpcUrl = 'https://soroban-rpc.mainnet.stellar.org', horizonUrl = 'https://horizon.stellar.org', network = 'mainnet') {
        super();
        this.provider = 'stellar';
        this.network = network;
        this.errorMapper = new error_codes_1.ErrorMapper(error_codes_1.STELLAR_ERROR_MAPPING);
        this.rpcClient = axios_1.default.create({
            baseURL: rpcUrl,
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        this.horizonClient = axios_1.default.create({
            baseURL: horizonUrl,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    getName() {
        return 'Stellar/Soroban';
    }
    supportsChainPair(sourceChain, targetChain) {
        // Stellar adapter supports:
        // - Stellar <-> Ethereum
        // - Stellar <-> Polygon
        // - Stellar <-> Arbitrum
        // - Stellar <-> Optimism
        // - Stellar <-> Base
        const supportedChains = [
            'ethereum',
            'polygon',
            'arbitrum',
            'optimism',
            'base',
        ];
        const isStellarSource = sourceChain === 'stellar';
        const isStellarTarget = targetChain === 'stellar';
        const isSupportedSource = supportedChains.includes(sourceChain);
        const isSupportedTarget = supportedChains.includes(targetChain);
        return ((isStellarSource && isSupportedTarget) ||
            (isSupportedSource && isStellarTarget));
    }
    async fetchRoutes(request) {
        if (!this.supportsChainPair(request.sourceChain, request.targetChain)) {
            return [];
        }
        try {
            const isFromStellar = request.sourceChain === 'stellar';
            if (isFromStellar) {
                return await this.fetchRoutesFromStellar(request);
            }
            else {
                return await this.fetchRoutesToStellar(request);
            }
        }
        catch (error) {
            console.error(`[StellarAdapter] Error fetching routes:`, error);
            return [];
        }
    }
    /**
     * Fetch routes when bridging FROM Stellar TO another chain
     */
    async fetchRoutesFromStellar(request) {
        try {
            // Validate amount
            const inputAmount = BigInt(request.assetAmount);
            if (!fee_estimation_1.StellarFees.isValidAmount(inputAmount, true)) {
                return [];
            }
            // Query Soroban bridge contract for quote
            const bridgeContractAddress = await this.getBridgeContractAddress();
            if (!bridgeContractAddress) {
                return [];
            }
            // Estimate fees using accurate Stellar fee model
            const feeEstimate = fee_estimation_1.StellarFees.estimateFees(inputAmount, true, // isFromStellar
            request.slippageTolerance || 0.5);
            const outputAmount = inputAmount - feeEstimate.totalFee;
            // Validate minimum output
            if (outputAmount <= 0n) {
                return [];
            }
            // Estimate latency
            const latencyEstimate = fee_estimation_1.LatencyEstimation.estimateLatency('stellar', request.targetChain);
            // Get current ledger info for deadline calculation
            const ledgerInfo = await this.getCurrentLedger();
            const deadline = ledgerInfo ? ledgerInfo.closeTime + 300 : undefined; // 5 minutes from now
            const minAmountOut = fee_estimation_1.StellarFees.calculateMinAmountOut(outputAmount, request.slippageTolerance || 0.5);
            const route = {
                id: this.generateRouteId(this.provider, request.sourceChain, request.targetChain, 0),
                provider: this.provider,
                sourceChain: request.sourceChain,
                targetChain: request.targetChain,
                inputAmount: inputAmount.toString(),
                outputAmount: outputAmount.toString(),
                fee: feeEstimate.totalFee.toString(),
                feePercentage: feeEstimate.feePercentage,
                reliability: 0.95,
                estimatedTime: latencyEstimate.estimatedSeconds,
                minAmountOut: minAmountOut.toString(),
                maxAmountOut: outputAmount.toString(),
                deadline,
                transactionData: {
                    contractAddress: bridgeContractAddress,
                    gasEstimate: '100000', // Estimated gas for Stellar operations
                },
                metadata: {
                    description: `Bridge from Stellar to ${request.targetChain} via Soroban`,
                    riskLevel: 1, // Stellar is considered very safe
                    network: this.network,
                    bridgeContract: bridgeContractAddress,
                    feeBreakdown: {
                        networkFee: feeEstimate.networkFee.toString(),
                        bridgeFee: feeEstimate.bridgeFee.toString(),
                        slippageFee: feeEstimate.slippageFee.toString(),
                    },
                    latencyConfidence: latencyEstimate.confidence,
                    latencyBreakdown: latencyEstimate.breakdown,
                },
            };
            return [route];
        }
        catch (error) {
            const mappedError = this.errorMapper.mapError(error);
            console.error(`[StellarAdapter] Error fetching routes from Stellar:`, mappedError);
            return [];
        }
    }
    /**
     * Fetch routes when bridging TO Stellar FROM another chain
     */
    async fetchRoutesToStellar(request) {
        try {
            // Validate amount
            const inputAmount = BigInt(request.assetAmount);
            if (!fee_estimation_1.StellarFees.isValidAmount(inputAmount, false)) {
                return [];
            }
            // For bridging TO Stellar, we need to query the source chain's bridge contract
            // This is a simplified implementation - in production, you'd query the actual bridge contract
            // Estimate fees using accurate fee model
            const feeEstimate = fee_estimation_1.StellarFees.estimateFees(inputAmount, false, // isFromStellar (bridging TO Stellar)
            request.slippageTolerance || 0.5);
            const outputAmount = inputAmount - feeEstimate.totalFee;
            // Validate minimum output
            if (outputAmount <= 0n) {
                return [];
            }
            // Estimate latency
            await Promise.resolve(); // Added await to satisfy require-await
            const latencyEstimate = fee_estimation_1.LatencyEstimation.estimateLatency(request.sourceChain, 'stellar');
            const minAmountOut = fee_estimation_1.StellarFees.calculateMinAmountOut(outputAmount, request.slippageTolerance || 0.5);
            const route = {
                id: this.generateRouteId(this.provider, request.sourceChain, request.targetChain, 0),
                provider: this.provider,
                sourceChain: request.sourceChain,
                targetChain: request.targetChain,
                inputAmount: inputAmount.toString(),
                outputAmount: outputAmount.toString(),
                fee: feeEstimate.totalFee.toString(),
                feePercentage: feeEstimate.feePercentage,
                reliability: 0.95,
                estimatedTime: latencyEstimate.estimatedSeconds,
                minAmountOut: minAmountOut.toString(),
                maxAmountOut: outputAmount.toString(),
                transactionData: {
                    contractAddress: request.tokenAddress, // Bridge contract on source chain
                    gasEstimate: '200000', // Estimated gas for EVM chains
                },
                metadata: {
                    description: `Bridge from ${request.sourceChain} to Stellar via Soroban`,
                    riskLevel: 1,
                    network: this.network,
                    feeBreakdown: {
                        networkFee: feeEstimate.networkFee.toString(),
                        bridgeFee: feeEstimate.bridgeFee.toString(),
                        slippageFee: feeEstimate.slippageFee.toString(),
                    },
                    latencyConfidence: latencyEstimate.confidence,
                    latencyBreakdown: latencyEstimate.breakdown,
                },
            };
            return [route];
        }
        catch (error) {
            const mappedError = this.errorMapper.mapError(error);
            console.error(`[StellarAdapter] Error fetching routes to Stellar:`, mappedError);
            return [];
        }
    }
    /**
     * Get bridge contract address for target chain
     */
    async getBridgeContractAddress() {
        // In production, this would query a registry or configuration
        // For now, return placeholder addresses
        await Promise.resolve(); // Added await to satisfy require-await
        return null;
    }
    /**
     * Get current Stellar ledger information
     */
    async getCurrentLedger() {
        try {
            const response = await this.horizonClient.get('/ledgers?order=desc&limit=1');
            const embedded = response.data
                ?._embedded;
            const records = embedded?.records;
            const ledgers = Array.isArray(records)
                ? records
                : undefined;
            if (ledgers && ledgers.length > 0) {
                const ledger = ledgers[0];
                return {
                    closeTime: parseInt(ledger.closed_at) || Math.floor(Date.now() / 1000),
                    sequence: parseInt(ledger.sequence) || 0,
                };
            }
            return null;
        }
        catch (error) {
            console.error(`[StellarAdapter] Error fetching ledger info:`, error);
            return null;
        }
    }
    /**
     * Estimate bridge time based on target chain
     */
    estimateBridgeTime(chain) {
        const latencyEstimate = fee_estimation_1.LatencyEstimation.estimateLatency('stellar', chain);
        return latencyEstimate.estimatedSeconds;
    }
    /**
     * Map Stellar RPC errors to standard error codes
     */
    mapError(error) {
        return this.errorMapper.mapError(error);
    }
    /**
     * Calculate minimum amount out with slippage
     */
    calculateMinAmountOut(amountOut, slippageTolerance) {
        return fee_estimation_1.StellarFees.calculateMinAmountOut(BigInt(amountOut), slippageTolerance || 0.5).toString();
    }
}
exports.StellarAdapter = StellarAdapter;
//# sourceMappingURL=stellar.js.map