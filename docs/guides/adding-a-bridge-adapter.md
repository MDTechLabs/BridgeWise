# Multi-Chain Bridge Integration Guide

This guide explains how third-party developers and contributors can implement a custom multi-chain bridge adapter for BridgeWise. By following this step-by-step process, your adapter will integrate directly into the BridgeWise routing engine, provider manager, and quote aggregation system.

---

## 1. Overview & Architecture

BridgeWise aggregates cross-chain quotes from multiple bridge protocols (such as StellarBridge, LayerZero, Wormhole, Hop, and Uniswap). Every bridge adapter implements a standardized provider interface (`IBridgeProvider` or `BridgeProvider`) defined under `packages/bridge-providers` and `libs/adapters`.

### Quote Request Lifecycle

1. **Client Request**: Frontend / API requests cross-chain routing options (`fromChain`, `toChain`, `fromToken`, `toToken`, `amount`).
2. **Provider Manager Dispatch**: `BridgeProviderManager` queries all registered, available bridge providers in parallel.
3. **Adapter Execution**: Your custom adapter processes the parameters, queries external RPC nodes/APIs, and converts protocol-specific data into standardized `BridgeRoute` objects.
4. **Ranking & Aggregation**: `BridgeProviderManager` normalizes fees, estimated execution duration, success rates, and slippage scores to rank the returned routes.

---

## 2. Implementing `IBridgeProvider`

Create your custom bridge adapter under `libs/adapters/src/<your-bridge-name>-adapter.ts` or `packages/adapters/<your-bridge-name>/`.

Here is a full TypeScript implementation example:

```typescript
import {
  BridgeProvider,
  BridgeParams,
  BridgeRoute,
  bridgeProviderManager,
} from '../../packages/bridge-providers';

/**
 * Interface definition for bridge providers in BridgeWise.
 */
export interface IBridgeProvider extends BridgeProvider {
  /** Optional health check method for monitoring RPC readiness */
  checkHealth(): Promise<boolean>;
}

export class CustomBridgeAdapter implements IBridgeProvider {
  public readonly name = 'CustomBridge';
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = process.env.CUSTOM_BRIDGE_API_KEY || '';
    this.baseUrl = process.env.CUSTOM_BRIDGE_BASE_URL || 'https://api.custombridge.io/v1';
  }

  /**
   * Check if the provider is available and properly configured
   */
  public isAvailable(): boolean {
    return Boolean(this.apiKey) && this.baseUrl.length > 0;
  }

  /**
   * Health check monitoring RPC endpoint status
   */
  public async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Supported chains for cross-chain bridging
   */
  public getSupportedChains(): string[] {
    return ['ethereum', 'arbitrum', 'optimism', 'polygon', 'stellar'];
  }

  /**
   * Supported tokens for bridging
   */
  public getSupportedTokens(): string[] {
    return ['USDC', 'USDT', 'ETH', 'XLM'];
  }

  /**
   * Calculate and fetch available routes for a given bridge parameter request
   */
  public async getRoutes(params: BridgeParams): Promise<BridgeRoute[]> {
    if (!this.isAvailable()) {
      throw new Error(`[${this.name}] Provider is unconfigured or unavailable`);
    }

    const { fromChain, toChain, fromToken, toToken, amount } = params;

    // Validate supported chains and tokens
    if (!this.getSupportedChains().includes(fromChain.toLowerCase()) ||
        !this.getSupportedChains().includes(toChain.toLowerCase())) {
      return [];
    }

    try {
      // Example call to external bridge provider quote API
      const parsedAmount = parseFloat(amount);
      const bridgeFeeUsd = 2.50;
      const gasCostUsd = 1.20;
      const estimatedTimeSec = 45;

      const outputAmount = (parsedAmount * 0.999).toFixed(6);

      const route: BridgeRoute = {
        id: `${this.name}-${Date.now()}`,
        fromChain,
        toChain,
        fromToken,
        toToken,
        amount,
        fee: {
          amount: '0.001',
          token: 'ETH',
          usdValue: bridgeFeeUsd,
        },
        gasEstimate: {
          amount: '0.0005',
          token: 'ETH',
          usdValue: gasCostUsd,
        },
        estimatedTime: estimatedTimeSec,
        successRate: 0.99,
        slippage: 0.1,
        confidence: 0.95,
        provider: this.name,
      };

      return [route];
    } catch (error) {
      console.error(`[${this.name}] Error fetching routes:`, error);
      return [];
    }
  }
}

// Auto-register adapter with BridgeProviderManager
export const customBridgeAdapter = new CustomBridgeAdapter();
if (customBridgeAdapter.isAvailable()) {
  bridgeProviderManager.registerProvider(customBridgeAdapter);
}
```

---

## 3. Registering Environment Variables

If your adapter requires external API keys or custom RPC endpoints, you must document and register them in `.env.example`.

Add your new configuration variables to `.env.example`:

```env
# Custom Bridge Adapter Configuration
CUSTOM_BRIDGE_API_KEY=your_api_key_here
CUSTOM_BRIDGE_BASE_URL=https://api.custombridge.io/v1
CUSTOM_BRIDGE_TIMEOUT_MS=5000
```

---

## 4. Registering & Verifying the Adapter

1. Instantiate and register your new adapter with `BridgeProviderManager`:
   ```typescript
   import { bridgeProviderManager } from 'packages/bridge-providers';
   import { CustomBridgeAdapter } from './custom-bridge-adapter';

   const adapter = new CustomBridgeAdapter();
   bridgeProviderManager.registerProvider(adapter);
   ```

2. Run the integration test suite to verify your adapter:
   ```bash
   pnpm test
   ```

3. Ensure all unit tests and TypeScript lint checks pass prior to opening your Pull Request.
