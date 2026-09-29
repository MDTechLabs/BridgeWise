"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StellarBridgeExecutor = void 0;
class StellarBridgeExecutor {
    constructor(wallet, bridgeContract, safetyGate, horizonUrl = "https://horizon.stellar.org") {
        this.walletConnection = null;
        this.wallet = wallet;
        this.bridgeContract = bridgeContract;
        this.safetyGate = safetyGate;
        this.horizonUrl = horizonUrl;
    }
    async executeTransfer(transfer, options = {}) {
        const startTime = Date.now();
        try {
            this.walletConnection = this.wallet.getConnection();
            if (!this.walletConnection || !this.walletConnection.isConnected) {
                throw new Error("Wallet not connected. Call connectWallet() first.");
            }
            const params = {
                sourceChain: transfer.sourceChain,
                targetChain: transfer.targetChain,
                amount: transfer.sourceAmount,
                recipient: transfer.recipient,
                slippage: options.slippage,
                deadline: options.deadline,
            };
            const sorobanAccount = {
                publicKey: this.walletConnection.publicKey,
                sequenceNumber: "1",
            };
            const preparedTx = await this.bridgeContract.prepareBridgeTransfer(params, sorobanAccount);
            const signingContext = {
                transfer: { ...transfer },
                options: { ...options },
                walletConnection: { ...this.walletConnection },
                preparedTransaction: preparedTx,
            };
            const { signed: signedTx } = await this.safetyGate.sign(signingContext, (validatedContext) => this.wallet.signTransaction(JSON.stringify(validatedContext.preparedTransaction)));
            const result = await this.bridgeContract.submitBridgeTransfer(signedTx.signature);
            // Log successful execution (without sensitive data)
            console.log(JSON.stringify({
                eventType: 'BRIDGE_TRANSFER',
                timestamp: new Date().toISOString(),
                metadata: {
                    adapter: 'stellar',
                    sourceChain: transfer.sourceChain,
                    targetChain: transfer.targetChain,
                    txHash: result.transactionHash.slice(0, 8) + '...' + result.transactionHash.slice(-8),
                    status: 'confirmed',
                    executionTimeMs: Date.now() - startTime,
                }
            }));
            return {
                success: true,
                transactionHash: result.transactionHash,
                details: result,
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            // Log failed execution
            console.log(JSON.stringify({
                eventType: 'BRIDGE_TRANSFER',
                timestamp: new Date().toISOString(),
                metadata: {
                    adapter: 'stellar',
                    sourceChain: transfer.sourceChain,
                    targetChain: transfer.targetChain,
                    status: 'failed',
                    errorCode: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
                    executionTimeMs: Date.now() - startTime,
                }
            }));
            return {
                success: false,
                error: msg,
            };
        }
    }
    async estimateTransferCost(transfer) {
        try {
            const params = {
                sourceChain: transfer.sourceChain,
                targetChain: transfer.targetChain,
                amount: transfer.sourceAmount,
                recipient: transfer.recipient,
            };
            const fees = await this.bridgeContract.estimateBridgeFees(params);
            return {
                networkFee: fees.baseFee,
                bridgeFee: fees.bridgeFee,
                totalFee: fees.totalFee,
                gasEstimate: "300000",
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error("Failed to estimate transfer cost: " + msg);
        }
    }
    async getTransferStatus(transactionHash) {
        try {
            return await this.bridgeContract.queryBridgeStatus(transactionHash);
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error("Failed to get transfer status: " + msg);
        }
    }
    async connectAndPrepare(network = "mainnet") {
        try {
            const connection = await this.wallet.connectWallet(network);
            this.walletConnection = connection;
            return connection;
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error("Failed to connect wallet: " + msg);
        }
    }
    async getNetworkStats() {
        try {
            const url = this.horizonUrl + "/ledgers?order=desc&limit=1";
            const response = await fetch(url);
            const data = await response.json();
            return {
                baseFee: data.records?.[0]?.base_fee_in_stroops || 100000,
                averageTime: 5,
                pendingTransactions: 0,
            };
        }
        catch (error) {
            return {
                baseFee: 100000,
                averageTime: 5,
                pendingTransactions: 0,
            };
        }
    }
}
exports.StellarBridgeExecutor = StellarBridgeExecutor;
//# sourceMappingURL=BridgeExecutor.js.map
