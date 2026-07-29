"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusChecker = exports.SUPPORTED_CHAINS = void 0;
exports.SUPPORTED_CHAINS = [
    'Ethereum',
    'Stellar',
    'Polygon',
    'Arbitrum',
    'Optimism',
    'Avalanche',
    'BSC',
    'Base',
    'Solana',
];
class StatusChecker {
    static isValidTxHash(hash) {
        if (!hash || typeof hash !== 'string')
            return false;
        const cleanHash = hash.trim();
        const evmRegex = /^0x[a-fA-F0-9]{64}$/;
        const genericHexRegex = /^[a-fA-F0-9]{64}$/;
        const shortEvmRegex = /^0x[a-fA-F0-9]{32,64}$/;
        return evmRegex.test(cleanHash) || genericHexRegex.test(cleanHash) || shortEvmRegex.test(cleanHash);
    }
    static normalizeChain(chain) {
        if (!chain || typeof chain !== 'string')
            return null;
        const trimmed = chain.trim();
        const match = exports.SUPPORTED_CHAINS.find((c) => c.toLowerCase() === trimmed.toLowerCase());
        return match || null;
    }
    async checkStatus(txHash, options = {}) {
        if (!txHash || !txHash.trim()) {
            throw new Error('Transaction hash is required.');
        }
        const cleanHash = txHash.trim();
        if (!StatusChecker.isValidTxHash(cleanHash)) {
            throw new Error(`Invalid transaction hash: ${cleanHash}`);
        }
        let sourceChain = 'Ethereum';
        if (options.sourceChain) {
            const normalized = StatusChecker.normalizeChain(options.sourceChain);
            if (!normalized) {
                throw new Error(`Unsupported source chain: '${options.sourceChain}'. Supported chains are: ${exports.SUPPORTED_CHAINS.join(', ')}`);
            }
            sourceChain = normalized;
        }
        const destinationChain = sourceChain === 'Stellar' ? 'Ethereum' : 'Stellar';
        const lastChar = cleanHash.slice(-1).toLowerCase();
        const isFailed = lastChar === 'f' || lastChar === 'e';
        const isPending = lastChar === '0' || lastChar === '1';
        const isCommitted = lastChar === '2' || lastChar === '3';
        let overallStatus = 'Relayed';
        let lockStatus = 'completed';
        let relayerStatus = 'completed';
        let destStatus = 'completed';
        const now = new Date();
        const lockTime = new Date(now.getTime() - 120000).toISOString();
        const verifyTime = new Date(now.getTime() - 60000).toISOString();
        const mintTime = now.toISOString();
        if (isFailed) {
            overallStatus = 'Failed';
            lockStatus = 'completed';
            relayerStatus = 'completed';
            destStatus = 'failed';
        }
        else if (isPending) {
            overallStatus = 'Pending';
            lockStatus = 'completed';
            relayerStatus = 'in_progress';
            destStatus = 'pending';
        }
        else if (isCommitted) {
            overallStatus = 'Committed';
            lockStatus = 'completed';
            relayerStatus = 'completed';
            destStatus = 'in_progress';
        }
        const milestones = [
            {
                name: 'Source Lock',
                status: lockStatus,
                timestamp: lockTime,
                txHash: cleanHash,
                details: `Tokens locked on ${sourceChain} source bridge contract`,
            },
            {
                name: 'Relayer Verification',
                status: relayerStatus,
                timestamp: relayerStatus !== 'pending' ? verifyTime : undefined,
                details: relayerStatus === 'in_progress'
                    ? 'Relayer network verifying transaction signatures'
                    : relayerStatus === 'completed'
                        ? 'Multi-sig consensus threshold reached by relayers'
                        : 'Waiting for relayer pickup',
            },
            {
                name: 'Destination Mint/Release',
                status: destStatus,
                timestamp: destStatus === 'completed' ? mintTime : undefined,
                details: destStatus === 'completed'
                    ? `Wrapped tokens released on ${destinationChain}`
                    : destStatus === 'failed'
                        ? `Destination mint transaction reverted on ${destinationChain}`
                        : destStatus === 'in_progress'
                            ? `Minting in progress on ${destinationChain}`
                            : 'Pending destination transaction execution',
            },
        ];
        return {
            txHash: cleanHash,
            sourceChain,
            destinationChain,
            status: overallStatus,
            milestones,
            sender: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
            recipient: 'GBX2K348910ALSKDJFHGPOIUYTREWQA1234567890',
            token: 'USDC',
            amount: 1000,
            timestamp: now.toISOString(),
        };
    }
}
exports.StatusChecker = StatusChecker;
//# sourceMappingURL=status-checker.js.map