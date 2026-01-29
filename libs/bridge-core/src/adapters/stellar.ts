import axios, { AxiosInstance } from 'axios';
import { BaseBridgeAdapter } from './base';
import { BridgeRoute, RouteRequest, BridgeProvider, ChainId } from '../types';
import { ErrorMapper, STELLAR_ERROR_MAPPING, BridgeErrorCode, StandardBridgeError } from '../error-codes';
import { StellarFees, LatencyEstimation, LatencyEstimate } from '../fee-estimation';

/**
 * Stellar/Soroban bridge adapter
 * Handles bridging between Stellar network and other chains via Soroban smart contracts
 */
export class StellarAdapter extends BaseBridgeAdapter {
  readonly provider: BridgeProvider = 'stellar';
  private readonly rpcClient: AxiosInstance;
  private readonly horizonClient: AxiosInstance;
  private readonly errorMapper: ErrorMapper;
  
  // Stellar network configuration
  private readonly network: 'mainnet' | 'testnet';
  
  constructor(
    rpcUrl: string = 'https://soroban-rpc.mainnet.stellar.org',
    horizonUrl: string = 'https://horizon.stellar.org',
    network: 'mainnet' | 'testnet' = 'mainnet'
  ) {
    super();
    this.network = network;
    this.errorMapper = new ErrorMapper(STELLAR_ERROR_MAPPING);
    
    this.rpcClient = axios.create({
      baseURL: rpcUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    this.horizonClient = axios.create({
      baseURL: horizonUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
  
  getName(): string {
    return 'Stellar/Soroban';
  }
  
  supportsChainPair(sourceChain: string, targetChain: string): boolean {
    // Stellar adapter supports:
    // - Stellar <-> Ethereum
    // - Stellar <-> Polygon
    // - Stellar <-> Arbitrum
    // - Stellar <-> Optimism
    // - Stellar <-> Base
    const supportedChains: ChainId[] = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'];
    
    const isStellarSource = sourceChain === 'stellar';
    const isStellarTarget = targetChain === 'stellar';
    const isSupportedSource = supportedChains.includes(sourceChain as ChainId);
    const isSupportedTarget = supportedChains.includes(targetChain as ChainId);
    
    return (isStellarSource && isSupportedTarget) || (isSupportedSource && isStellarTarget);
  }
  
  async fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]> {
    if (!this.supportsChainPair(request.sourceChain, request.targetChain)) {
      return [];
    }
    
    try {
      const isFromStellar = request.sourceChain === 'stellar';
      
      if (isFromStellar) {
        return await this.fetchRoutesFromStellar(request);
      } else {
        return await this.fetchRoutesToStellar(request);
      }
    } catch (error) {
      console.error(`[StellarAdapter] Error fetching routes:`, error);
      return [];
    }
  }
  
  /**
   * Fetch routes when bridging FROM Stellar TO another chain
   */
  private async fetchRoutesFromStellar(request: RouteRequest): Promise<BridgeRoute[]> {
    try {
      // Validate amount
      const inputAmount = BigInt(request.assetAmount);
      if (!StellarFees.isValidAmount(inputAmount, true)) {
        return [];
      }

      // Query Soroban bridge contract for quote
      const bridgeContractAddress = await this.getBridgeContractAddress(request.targetChain);
      
      if (!bridgeContractAddress) {
        return [];
      }
      
      // Estimate fees using accurate Stellar fee model
      const feeEstimate = StellarFees.estimateFees(
        inputAmount,
        true, // isFromStellar
        request.slippageTolerance || 0.5
      );

      const outputAmount = inputAmount - feeEstimate.totalFee;

      // Validate minimum output
      if (outputAmount <= 0n) {
        return [];
      }

      // Estimate latency
      const latencyEstimate = LatencyEstimation.estimateLatency('stellar', request.targetChain);

      // Get current ledger info for deadline calculation
      const ledgerInfo = await this.getCurrentLedger();
      const deadline = ledgerInfo ? ledgerInfo.closeTime + 300 : undefined; // 5 minutes from now

      const minAmountOut = StellarFees.calculateMinAmountOut(
        outputAmount,
        request.slippageTolerance || 0.5
      );

      const route: BridgeRoute = {
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
    } catch (error) {
      const mappedError = this.errorMapper.mapError(error);
      console.error(`[StellarAdapter] Error fetching routes from Stellar:`, mappedError);
      return [];
    }
  }
  
  /**
   * Fetch routes when bridging TO Stellar FROM another chain
   */
  private async fetchRoutesToStellar(request: RouteRequest): Promise<BridgeRoute[]> {
    try {
      // Validate amount
      const inputAmount = BigInt(request.assetAmount);
      if (!StellarFees.isValidAmount(inputAmount, false)) {
        return [];
      }

      // For bridging TO Stellar, we need to query the source chain's bridge contract
      // This is a simplified implementation - in production, you'd query the actual bridge contract
      
      // Estimate fees using accurate fee model
      const feeEstimate = StellarFees.estimateFees(
        inputAmount,
        false, // isFromStellar (bridging TO Stellar)
        request.slippageTolerance || 0.5
      );

      const outputAmount = inputAmount - feeEstimate.totalFee;

      // Validate minimum output
      if (outputAmount <= 0n) {
        return [];
      }

      // Estimate latency
      const latencyEstimate = LatencyEstimation.estimateLatency(request.sourceChain, 'stellar');

      const minAmountOut = StellarFees.calculateMinAmountOut(
        outputAmount,
        request.slippageTolerance || 0.5
      );

      const route: BridgeRoute = {
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
    } catch (error) {
      const mappedError = this.errorMapper.mapError(error);
      console.error(`[StellarAdapter] Error fetching routes to Stellar:`, mappedError);
      return [];
    }
  }
  
  /**
   * Get bridge contract address for target chain
   */
  private async getBridgeContractAddress(targetChain: ChainId): Promise<string | null> {
    // In production, this would query a registry or configuration
    // For now, return placeholder addresses
    const contractMap: Record<ChainId, string | null> = {
      ethereum: null, // Would be actual contract address
      polygon: null,
      arbitrum: null,
      optimism: null,
      base: null,
      stellar: null,
      gnosis: null,
      nova: null,
      bsc: null,
      avalanche: null,
    };
    
    return contractMap[targetChain] || null;
  }
  
  /**
   * Get current Stellar ledger information
   */
  private async getCurrentLedger(): Promise<{ closeTime: number; sequence: number } | null> {
    try {
      const response = await this.horizonClient.get('/ledgers?order=desc&limit=1');
      const ledgers = response.data?._embedded?.records;
      
      if (ledgers && ledgers.length > 0) {
        const ledger = ledgers[0];
        return {
          closeTime: parseInt(ledger.closed_at) || Math.floor(Date.now() / 1000),
          sequence: parseInt(ledger.sequence) || 0,
        };
      }
      
      return null;
    } catch (error) {
      console.error(`[StellarAdapter] Error fetching ledger info:`, error);
      return null;
    }
  }
  
  /**
   * Estimate bridge time based on target chain
   */
  private estimateBridgeTime(chain: ChainId): number {
    const latencyEstimate = LatencyEstimation.estimateLatency('stellar', chain);
    return latencyEstimate.estimatedSeconds;
  }

  /**
   * Map Stellar RPC errors to standard error codes
   */
  mapError(error: unknown): StandardBridgeError {
    return this.errorMapper.mapError(error);
  }

  /**
   * Calculate minimum amount out with slippage
   */
  private calculateMinAmountOut(amountOut: string, slippageTolerance?: number): string {
    return StellarFees.calculateMinAmountOut(
      BigInt(amountOut),
      slippageTolerance || 0.5
    ).toString();
  }
}
