import { Injectable } from '@nestjs/common';
import { GasPriceAdapter } from '../fee-estimation/adapters/gas-price.adapter';
import { EstimateFeeQueryDto, RelayFeeEstimateDto } from './dto/estimate-fee.dto';

// Base transaction overhead, in gas units, for executing a relayed payload
// on an EVM-style target chain.
const BASE_GAS_UNITS = 21_000;
// Additional gas units charged per byte of cross-chain payload (calldata cost).
const GAS_PER_BYTE = 16;
// Relayer margin applied on top of the raw destination gas cost, in basis points.
const RELAYER_MARGIN_BPS = 500;

// Stellar/Soroban fees are a small flat resource fee rather than a gas-price *
// gas-limit model, so they're estimated separately from EVM chains.
const STELLAR_BASE_FEE_STROOPS = 100;
const STELLAR_FEE_PER_BYTE_STROOPS = 5;
const STROOPS_PER_XLM = 10_000_000;

const NATIVE_TOKEN_SYMBOL: Record<string, string> = {
  ethereum: 'ETH',
  polygon: 'MATIC',
  arbitrum: 'ETH',
  optimism: 'ETH',
  base: 'ETH',
  bsc: 'BNB',
  avalanche: 'AVAX',
  fantom: 'FTM',
  gnosis: 'xDAI',
  scroll: 'ETH',
  linea: 'ETH',
  zksync: 'ETH',
  zkevm: 'ETH',
  stellar: 'XLM',
};

// Static USD reference prices used to convert native fee amounts to a USD
// equivalent. In production this should be sourced from a live price feed;
// kept static here to keep the estimator dependency-free and fast.
const NATIVE_TOKEN_USD_PRICE: Record<string, number> = {
  ETH: 3200,
  MATIC: 0.7,
  BNB: 550,
  AVAX: 28,
  FTM: 0.5,
  xDAI: 1,
  XLM: 0.11,
};

/**
 * Estimates the total cost of relaying a cross-chain payload: the gas cost
 * to execute it on the target chain, plus a relayer margin.
 */
@Injectable()
export class FeeEstimatorService {
  constructor(private readonly gasPriceAdapter: GasPriceAdapter) {}

  async estimateFee(query: EstimateFeeQueryDto): Promise<RelayFeeEstimateDto> {
    const targetChain = query.targetChain.toLowerCase();
    const estimatedGasUnits = BASE_GAS_UNITS + query.payloadByteLength * GAS_PER_BYTE;

    const { destinationGasCostNative, targetGasPrice } =
      targetChain === 'stellar'
        ? this.estimateStellarFee(query.payloadByteLength)
        : await this.estimateEvmFee(targetChain, estimatedGasUnits);

    const relayerMarginNative = (destinationGasCostNative * RELAYER_MARGIN_BPS) / 10_000;
    const totalFeeNative = destinationGasCostNative + relayerMarginNative;

    const nativeTokenSymbol = NATIVE_TOKEN_SYMBOL[targetChain] ?? 'ETH';
    const usdPrice = NATIVE_TOKEN_USD_PRICE[nativeTokenSymbol] ?? 0;
    const totalFeeUsd = totalFeeNative * usdPrice;

    return {
      sourceChain: query.sourceChain,
      targetChain: query.targetChain,
      payloadByteLength: query.payloadByteLength,
      estimatedGasUnits,
      targetGasPrice,
      relayerMarginBps: RELAYER_MARGIN_BPS,
      nativeTokenSymbol,
      destinationGasCostNative: destinationGasCostNative.toFixed(8),
      relayerMarginNative: relayerMarginNative.toFixed(8),
      totalFeeNative: totalFeeNative.toFixed(8),
      totalFeeUsd: totalFeeUsd.toFixed(4),
      quotedAt: Date.now(),
    };
  }

  private async estimateEvmFee(targetChain: string, estimatedGasUnits: number) {
    const gasPriceInfo = await this.gasPriceAdapter.getGasPrice(targetChain);
    const destinationGasCostNative = this.gasPriceAdapter.calculateGasFee(
      targetChain,
      gasPriceInfo.gasPriceGwei,
      estimatedGasUnits,
    );

    return {
      destinationGasCostNative,
      targetGasPrice: `${gasPriceInfo.gasPriceGwei} gwei`,
    };
  }

  private estimateStellarFee(payloadByteLength: number) {
    const feeStroops = STELLAR_BASE_FEE_STROOPS + payloadByteLength * STELLAR_FEE_PER_BYTE_STROOPS;

    return {
      destinationGasCostNative: feeStroops / STROOPS_PER_XLM,
      targetGasPrice: `${feeStroops} stroops (flat resource fee)`,
    };
  }
}
