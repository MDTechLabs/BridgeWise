import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { GasEstimateResponse, VolatilityMetrics } from './gas-types.interface';

@Injectable()
export class GasPredictorService {
    private readonly logger = new Logger(GasPredictorService.name);
    private readonly CACHE_TTL = 12; // seconds

    constructor(
        @InjectRedis() private readonly redis: Redis,
        private readonly configService: ConfigService,
    ) { }

    async getGasEstimate(chain: string): Promise<GasEstimateResponse> {
        const cacheKey = `gas:estimate:${chain.toLowerCase()}`;

        // Check Redis cache
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        let estimate: Omit<GasEstimateResponse, 'timestamp' | 'chain' | 'suggestedGas' | 'buffer'>;

        const normalizedChain = chain.toLowerCase();
        if (normalizedChain === 'stellar' || normalizedChain === 'soroban') {
            estimate = await this.estimateSorobanGas();
        } else {
            estimate = await this.estimateEvmGas(normalizedChain);
        }

        // Apply 15% safety buffer during high-volatility periods
        const buffer = estimate.isVolatile ? 1.15 : 1.0;
        const suggestedGas = (BigInt(estimate.totalGasEstimate) * BigInt(Math.floor(buffer * 100)) / 100n).toString();

        const result: GasEstimateResponse = {
            ...estimate,
            suggestedGas,
            buffer,
            chain: normalizedChain,
            timestamp: Date.now(),
        };

        // Cache for 12 seconds
        await this.redis.set(cacheKey, JSON.stringify(result), 'EX', this.CACHE_TTL);

        this.logger.log(`Gas estimate generated for ${chain}`);
        return result;
    }

    private async estimateEvmGas(chain: string): Promise<Omit<GasEstimateResponse, 'timestamp' | 'chain' | 'suggestedGas' | 'buffer'>> {
        const rpcUrl = this.configService.get<string>(`RPC_${chain.toUpperCase()}`);
        if (!rpcUrl) {
            throw new Error(`RPC URL not configured for chain: ${chain}`);
        }

        const provider = new ethers.JsonRpcProvider(rpcUrl);

        // Sample trailing 20 blocks concurrently
        const latestBlock = await provider.getBlockNumber();
        
        const fetchBlockData = async (blockNum: number) => {
            try {
                const block = await provider.getBlock(blockNum);
                if (block?.baseFeePerGas) {
                    const feeHistory = await provider.send('eth_feeHistory', ['0x3', `0x${blockNum.toString(16)}`, [25]]);
                    const priorityFees = feeHistory.reward?.flat() || [];
                    const avgPriority = priorityFees.length
                        ? priorityFees.reduce((sum: string, fee: string) => (BigInt(sum) + BigInt(fee)).toString(), '0')
                        : '0';

                    return {
                        baseFee: BigInt(block.baseFeePerGas),
                        priorityFee: BigInt(avgPriority),
                    };
                }
            } catch (error) {
                this.logger.warn(`Failed to fetch block ${blockNum}`);
            }
            return null;
        };

        const blockPromises = [];
        for (let i = 0; i < 20; i++) {
            blockPromises.push(fetchBlockData(latestBlock - i));
        }

        const blocksData = (await Promise.all(blockPromises)).filter(data => data !== null);
        const sampleCount = blocksData.length;

        let totalBaseFee = 0n;
        let totalPriorityFee = 0n;
        const baseFeesForVolatility: number[] = [];

        for (const data of blocksData) {
            totalBaseFee += data!.baseFee;
            totalPriorityFee += data!.priorityFee;
            baseFeesForVolatility.push(Number(data!.baseFee));
        }

        const avgBaseFee = sampleCount ? totalBaseFee / BigInt(sampleCount) : 0n;
        const avgPriorityFee = sampleCount ? totalPriorityFee / BigInt(sampleCount) : 0n;

        // Volatility Calculation
        let isVolatile = false;
        let volatilityMetrics: VolatilityMetrics | undefined = undefined;

        if (sampleCount > 1) {
            const mean = Number(avgBaseFee);
            const variance = baseFeesForVolatility.reduce((sum, fee) => sum + Math.pow(fee - mean, 2), 0) / sampleCount;
            const standardDeviation = Math.sqrt(variance);
            const coefficientOfVariation = mean > 0 ? standardDeviation / mean : 0;

            // Threshold for volatility (e.g. CV > 0.15 indicates high volatility)
            isVolatile = coefficientOfVariation > 0.15;
            volatilityMetrics = {
                standardDeviation,
                mean,
                coefficientOfVariation,
                isVolatile,
            };
        }

        return {
            baseFee: avgBaseFee.toString(),
            priorityFee: avgPriorityFee.toString(),
            totalGasEstimate: (avgBaseFee + avgPriorityFee * 2n).toString(),
            isVolatile,
            volatilityMetrics,
        };
    }

    private async estimateSorobanGas(): Promise<Omit<GasEstimateResponse, 'timestamp' | 'chain' | 'suggestedGas' | 'buffer'>> {
        // Simulated Stellar Soroban resource fees as per acceptance criteria
        const baseFee = '100000';
        
        return {
            baseFee,
            priorityFee: '50000',
            totalGasEstimate: '400000',
            isVolatile: false,
            volatilityMetrics: {
                standardDeviation: 0,
                mean: Number(baseFee),
                coefficientOfVariation: 0,
                isVolatile: false,
            }
        };
    }
}