import { BridgeRoute } from '../../../../src/services/route-ranker';

export enum Scenario {
  OPTIMAL = 'OPTIMAL',
  HIGH_CONGESTION = 'HIGH_CONGESTION',
  UNRELIABLE_PROVIDERS = 'UNRELIABLE_PROVIDERS',
}

export interface BenchmarkDataset {
  scenario: Scenario;
  routes: BridgeRoute[];
  expectedBestRouteId: string;
}

const baseRoute: Omit<BridgeRoute, 'id' | 'fee' | 'estimatedTime' | 'successRate' | 'provider'> = {
  fromChain: 'Ethereum',
  toChain: 'Stellar',
  fromToken: 'USDC',
  toToken: 'USDC',
  amount: '1000',
  slippage: 0.5,
  confidence: 0.9,
};

export class DatasetGenerator {
  static generateOptimal(): BenchmarkDataset {
    const routes: BridgeRoute[] = [
      {
        ...baseRoute,
        id: 'route-optimal-1',
        provider: 'ProviderA',
        fee: { amount: '1', token: 'USDC', usdValue: 1 },
        estimatedTime: 5, // very fast
        successRate: 0.99, // very reliable
      },
      {
        ...baseRoute,
        id: 'route-optimal-2',
        provider: 'ProviderB',
        fee: { amount: '5', token: 'USDC', usdValue: 5 },
        estimatedTime: 20,
        successRate: 0.95,
      },
      {
        ...baseRoute,
        id: 'route-optimal-3',
        provider: 'ProviderC',
        fee: { amount: '10', token: 'USDC', usdValue: 10 },
        estimatedTime: 60,
        successRate: 0.85,
      },
    ];

    return {
      scenario: Scenario.OPTIMAL,
      routes,
      expectedBestRouteId: 'route-optimal-1',
    };
  }

  static generateHighCongestion(): BenchmarkDataset {
    const routes: BridgeRoute[] = [
      {
        ...baseRoute,
        id: 'route-congestion-1',
        provider: 'ProviderA',
        fee: { amount: '20', token: 'USDC', usdValue: 20 },
        estimatedTime: 120, // super slow due to congestion
        successRate: 0.9,
      },
      {
        ...baseRoute,
        id: 'route-congestion-2',
        provider: 'ProviderB',
        fee: { amount: '25', token: 'USDC', usdValue: 25 },
        estimatedTime: 15, // fast but expensive
        successRate: 0.95,
      },
      {
        ...baseRoute,
        id: 'route-congestion-3',
        provider: 'ProviderC',
        fee: { amount: '15', token: 'USDC', usdValue: 15 },
        estimatedTime: 60,
        successRate: 0.92,
      },
    ];

    return {
      scenario: Scenario.HIGH_CONGESTION,
      routes,
      // route-congestion-2 is the best because it bypasses congestion, despite higher fee
      expectedBestRouteId: 'route-congestion-2',
    };
  }

  static generateUnreliableProviders(): BenchmarkDataset {
    const routes: BridgeRoute[] = [
      {
        ...baseRoute,
        id: 'route-unreliable-1',
        provider: 'ProviderScammy',
        fee: { amount: '0.1', token: 'USDC', usdValue: 0.1 }, // extremely cheap
        estimatedTime: 1, // extremely fast
        successRate: 0.3, // terrible reliability
      },
      {
        ...baseRoute,
        id: 'route-unreliable-2',
        provider: 'ProviderSolid',
        fee: { amount: '5', token: 'USDC', usdValue: 5 },
        estimatedTime: 10,
        successRate: 0.99, // rock solid
      },
      {
        ...baseRoute,
        id: 'route-unreliable-3',
        provider: 'ProviderMid',
        fee: { amount: '2', token: 'USDC', usdValue: 2 },
        estimatedTime: 15,
        successRate: 0.6,
      },
    ];

    return {
      scenario: Scenario.UNRELIABLE_PROVIDERS,
      routes,
      expectedBestRouteId: 'route-unreliable-2',
    };
  }

  static generateAll(): BenchmarkDataset[] {
    return [
      this.generateOptimal(),
      this.generateHighCongestion(),
      this.generateUnreliableProviders(),
    ];
  }
}
