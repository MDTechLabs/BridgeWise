import axios, { AxiosInstance } from 'axios';
import { BaseBridgeAdapter } from './base';
import { BridgeRoute, RouteRequest, BridgeProvider, ChainId } from '../types';

interface ScanApiResponse {
  messages?: unknown[];
}

export class LayerZeroAdapter extends BaseBridgeAdapter {
  // Runtime enum for BridgeProvider
  static BridgeProviderEnum = {
    LAYERZERO: 'layerzero',
    HOP: 'hop',
    STELLAR: 'stellar',
  } as const;
  readonly provider = LayerZeroAdapter.BridgeProviderEnum.LAYERZERO;

  private readonly scanApiClient: AxiosInstance;

  constructor() {
    super();

    this.scanApiClient = axios.create({
      baseURL: 'https://api.layerzeroscan.com',
      timeout: 10_000,
    });
  }

  getName(): string {
    return 'LayerZero';
  }

  supportsChainPair(from: ChainId, to: ChainId): boolean {
    return from !== to;
  }

  public async fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]> {
    const sourceEid = this.resolveEndpointId(request.sourceChain);
    const targetEid = this.resolveEndpointId(request.targetChain);

    return this.fetchRoutesFromScan(request, sourceEid, targetEid);
  }

  private resolveEndpointId(chain: ChainId): number {
    const map: Partial<Record<ChainId, number>> = {
      ethereum: 30101,
      polygon: 30109,
      arbitrum: 30110,
      stellar: 0,
    };
    return map[chain] ?? 0;
  }

  protected async estimateFee(
    _sourceEid: number,
    _targetEid: number,
    assetAmount: string,
  ): Promise<string> {
    const amount = BigInt(assetAmount);
    return (amount / 1000n).toString();
  }

  protected estimateBridgeTime(): number {
    return 180;
  }

  protected calculateMinAmountOut(
    outputAmount: string,
    slippageTolerance: number,
  ): string {
    const amount = BigInt(outputAmount);
    const slippage = BigInt(
      Math.floor((Number(amount) * slippageTolerance) / 100),
    );

    return (amount - slippage).toString();
  }

  private async fetchRoutesFromScan(
    request: RouteRequest,
    sourceEid: number,
    targetEid: number,
  ): Promise<BridgeRoute[]> {
    try {
      const response = await this.scanApiClient.get<ScanApiResponse>(
        '/messages/latest',
        {
          params: {
            limit: 10,
            srcEid: sourceEid,
            dstEid: targetEid,
          },
        },
      );

      const messages = response.data?.messages ?? [];

      if (!Array.isArray(messages) || messages.length === 0) {
        return [];
      }

      const estimatedFee = await this.estimateFee(
        sourceEid,
        targetEid,
        request.assetAmount,
      );

      const inputAmount = BigInt(request.assetAmount);
      const fee = BigInt(estimatedFee);
      const outputAmount = inputAmount - fee;

      const route: BridgeRoute = {
        id: this.generateRouteId(
          this.provider,
          request.sourceChain,
          request.targetChain,
          0,
        ),
        provider: this.provider,
        sourceChain: request.sourceChain,
        targetChain: request.targetChain,
        inputAmount: inputAmount.toString(),
        outputAmount: outputAmount.toString(),
        fee: fee.toString(),
        feePercentage: this.calculateFeePercentage(
          inputAmount.toString(),
          outputAmount.toString(),
        ),
        reliability: 0.92,
        estimatedTime: this.estimateBridgeTime(),
        minAmountOut: this.calculateMinAmountOut(
          outputAmount.toString(),
          request.slippageTolerance ?? 0,
        ),
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
    } catch (error) {
      if (error instanceof Error) {
        console.error('[LayerZeroAdapter]', error.message);
      }
      return [];
    }
  }
}
