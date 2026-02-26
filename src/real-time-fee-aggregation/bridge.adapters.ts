import { Injectable } from '@nestjs/common';
import { BridgeAdapter, NormalizedQuote, QuoteRequest } from '../interfaces/bridge-adapter.interface';

/**
 * Across Protocol Adapter
 * Typically fast with lower fees via optimistic relays.
 */
@Injectable()
export class AcrossAdapter implements BridgeAdapter {
  readonly name = 'Across';

  private readonly SUPPORTED_ROUTES: Array<[number, number, string[]]> = [
    [1, 137, ['USDC', 'USDT', 'WETH', 'DAI']],
    [1, 42161, ['USDC', 'USDT', 'WETH']],
    [1, 10, ['USDC', 'USDT', 'WETH']],
    [137, 1, ['USDC', 'USDT', 'WETH']],
  ];

  supportsRoute(fromChain: number, toChain: number, token: string): boolean {
    return this.SUPPORTED_ROUTES.some(
      ([from, to, tokens]) =>
        from === fromChain && to === toChain && tokens.includes(token),
    );
  }

  async getQuote(request: QuoteRequest): Promise<NormalizedQuote> {
    // Simulate network call with realistic latency
    await this.simulateLatency(300, 800);

    const amount = parseFloat(request.amount);
    const feeRate = 0.0005; // 0.05%
    const relayerFee = amount * 0.001;
    const totalFeeUSD = amount * feeRate + relayerFee;
    const outputAmount = (amount - totalFeeUSD).toFixed(6);

    return {
      bridgeName: this.name,
      totalFeeUSD: parseFloat(totalFeeUSD.toFixed(4)),
      feeToken: request.token,
      estimatedArrivalTime: 120, // ~2 min via optimistic relay
      outputAmount,
      supported: true,
    };
  }

  private simulateLatency(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Hop Protocol Adapter
 * AMM-based bridging, moderate speed and fees.
 */
@Injectable()
export class HopAdapter implements BridgeAdapter {
  readonly name = 'Hop';

  private readonly SUPPORTED_ROUTES: Array<[number, number, string[]]> = [
    [1, 137, ['USDC', 'USDT', 'DAI', 'MATIC']],
    [1, 42161, ['USDC', 'USDT', 'ETH']],
    [1, 10, ['USDC', 'USDT', 'ETH', 'SNX']],
    [137, 42161, ['USDC', 'USDT']],
  ];

  supportsRoute(fromChain: number, toChain: number, token: string): boolean {
    return this.SUPPORTED_ROUTES.some(
      ([from, to, tokens]) =>
        from === fromChain && to === toChain && tokens.includes(token),
    );
  }

  async getQuote(request: QuoteRequest): Promise<NormalizedQuote> {
    await this.simulateLatency(400, 1000);

    const amount = parseFloat(request.amount);
    const lpFee = amount * 0.001; // 0.1% LP fee
    const bonderFee = amount * 0.0015;
    const gasCost = 2.5; // USD
    const totalFeeUSD = lpFee + bonderFee + gasCost;
    const outputAmount = (amount - totalFeeUSD).toFixed(6);

    return {
      bridgeName: this.name,
      totalFeeUSD: parseFloat(totalFeeUSD.toFixed(4)),
      feeToken: request.token,
      estimatedArrivalTime: 300, // ~5 min
      outputAmount,
      supported: true,
    };
  }

  private simulateLatency(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Stargate (LayerZero) Adapter
 * Deep liquidity pools, good for large amounts.
 */
@Injectable()
export class StargateAdapter implements BridgeAdapter {
  readonly name = 'Stargate';

  private readonly SUPPORTED_ROUTES: Array<[number, number, string[]]> = [
    [1, 137, ['USDC', 'USDT']],
    [1, 42161, ['USDC', 'USDT', 'ETH']],
    [1, 43114, ['USDC', 'USDT']],
    [137, 43114, ['USDC']],
    [42161, 10, ['USDC', 'ETH']],
  ];

  supportsRoute(fromChain: number, toChain: number, token: string): boolean {
    return this.SUPPORTED_ROUTES.some(
      ([from, to, tokens]) =>
        from === fromChain && to === toChain && tokens.includes(token),
    );
  }

  async getQuote(request: QuoteRequest): Promise<NormalizedQuote> {
    await this.simulateLatency(500, 1200);

    const amount = parseFloat(request.amount);
    const protocolFee = amount * 0.0006; // 0.06%
    const lzFee = 1.8; // LayerZero messaging fee in USD
    const totalFeeUSD = protocolFee + lzFee;
    const outputAmount = (amount - totalFeeUSD).toFixed(6);

    return {
      bridgeName: this.name,
      totalFeeUSD: parseFloat(totalFeeUSD.toFixed(4)),
      feeToken: request.token,
      estimatedArrivalTime: 600, // ~10 min
      outputAmount,
      supported: true,
    };
  }

  private simulateLatency(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
