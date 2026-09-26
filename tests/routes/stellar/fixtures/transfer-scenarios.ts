import type { TransferRequest } from '../../../../src/routing/smart/stellar/soroban-smart-routing-engine';
import type { FallbackReason } from '../../../../src/routing/fallbacks/stellar/types';
import type { MockProviderConfig } from '../mocks/bridge-provider.mock';

export interface RouteSpec {
  routeId: string;
  providerId: string;
  sourceChain: string;
  destinationChain: string;
  feeBase: number;
  latencyMs: number;
  maxSlippage?: number;
  contractAddress?: string;
}

export interface ExpectedOutcome {
  /** Provider id that should be selected as the best route. */
  bestProvider?: string;
  /** Route id that should be selected. */
  bestRouteId?: string;
  /** Whether a fallback should be triggered. */
  fallbackTriggered?: boolean;
  /** Expected fallback reason. */
  fallbackReason?: FallbackReason;
  /** Upper bound on the winning route's fee. */
  maxFee?: number;
  /** Upper bound on the winning route's latency in ms. */
  maxLatencyMs?: number;
  /** Whether no route should be found (all providers failed). */
  noRouteFound?: boolean;
}

export interface TransferScenario {
  id: string;
  description: string;
  request: TransferRequest;
  routes: RouteSpec[];
  /** Provider reliability overrides keyed by provider id. */
  reliabilityOverrides?: Record<string, number>;
  /** Simulates a primary route failure before fallback planning. */
  primaryFailure?: {
    failedRouteId: string;
    reason: FallbackReason;
  };
  expected: ExpectedOutcome;
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

export const TRANSFER_SCENARIOS: Record<string, TransferScenario> = {
  happyPath: {
    id: 'happy-path',
    description: 'Standard USDC transfer from Stellar to Ethereum with three healthy providers',
    request: {
      sourceChain: 'Stellar',
      destinationChain: 'Ethereum',
      asset: 'USDC',
      amount: '1000.00',
      sender: 'GABCDE',
      recipient: '0xABCDE',
    },
    routes: [
      { routeId: 'r-allbridge-eth', providerId: 'AllBridge', sourceChain: 'Stellar', destinationChain: 'Ethereum', feeBase: 1.5, latencyMs: 4200 },
      { routeId: 'r-squid-eth', providerId: 'Squid', sourceChain: 'Stellar', destinationChain: 'Ethereum', feeBase: 2.1, latencyMs: 6700 },
      { routeId: 'r-wormhole-eth', providerId: 'Wormhole', sourceChain: 'Stellar', destinationChain: 'Ethereum', feeBase: 1.2, latencyMs: 5100 },
    ],
    expected: {
      bestProvider: 'Wormhole',
      maxFee: 2.5,
      fallbackTriggered: false,
    },
  },

  cheapestRoute: {
    id: 'cheapest-route',
    description: 'Cost-prioritized routing should pick the lowest fee provider',
    request: {
      sourceChain: 'Stellar',
      destinationChain: 'Polygon',
      asset: 'USDC',
      amount: '500.00',
      sender: 'GABCDE',
      recipient: '0xABCDE',
      prioritize: 'cost',
    },
    routes: [
      { routeId: 'r-stargate-poly', providerId: 'Stargate', sourceChain: 'Stellar', destinationChain: 'Polygon', feeBase: 0.6, latencyMs: 3500 },
      { routeId: 'r-allbridge-poly', providerId: 'AllBridge', sourceChain: 'Stellar', destinationChain: 'Polygon', feeBase: 1.5, latencyMs: 3100 },
    ],
    expected: {
      bestProvider: 'Stargate',
      maxFee: 1.0,
    },
  },

  fastestRoute: {
    id: 'fastest-route',
    description: 'Speed-prioritized routing should pick the lowest latency provider',
    request: {
      sourceChain: 'Stellar',
      destinationChain: 'Base',
      asset: 'XLM',
      amount: '10000.00',
      sender: 'GABCDE',
      recipient: '0xABCDE',
      prioritize: 'speed',
    },
    routes: [
      { routeId: 'r-allbridge-base', providerId: 'AllBridge', sourceChain: 'Stellar', destinationChain: 'Base', feeBase: 0.3, latencyMs: 2800 },
      { routeId: 'r-wormhole-base', providerId: 'Wormhole', sourceChain: 'Stellar', destinationChain: 'Base', feeBase: 1.8, latencyMs: 5200 },
    ],
    expected: {
      bestProvider: 'AllBridge',
      maxLatencyMs: 3000,
    },
  },

  primaryProviderFails: {
    id: 'primary-provider-fails',
    description: 'Primary route fails mid-execution; fallback planner should select an alternative',
    request: {
      sourceChain: 'Stellar',
      destinationChain: 'Ethereum',
      asset: 'USDC',
      amount: '5000.00',
      sender: 'GABCDE',
      recipient: '0xABCDE',
    },
    routes: [
      { routeId: 'r-primary-eth', providerId: 'AllBridge', sourceChain: 'Stellar', destinationChain: 'Ethereum', feeBase: 1.5, latencyMs: 4200 },
      { routeId: 'r-fallback-eth', providerId: 'Wormhole', sourceChain: 'Stellar', destinationChain: 'Ethereum', feeBase: 1.2, latencyMs: 5100 },
    ],
    primaryFailure: {
      failedRouteId: 'r-primary-eth',
      reason: 'provider_unavailable',
    },
    expected: {
      fallbackTriggered: true,
      fallbackReason: 'provider_unavailable',
      bestProvider: 'Wormhole',
    },
  },

  feeSpikeTriggersFailover: {
    id: 'fee-spike-failover',
    description: 'A sudden fee spike on the primary provider should trigger fallback to a cheaper route',
    request: {
      sourceChain: 'Stellar',
      destinationChain: 'Ethereum',
      asset: 'USDC',
      amount: '2000.00',
      sender: 'GABCDE',
      recipient: '0xABCDE',
    },
    routes: [
      { routeId: 'r-spiked', providerId: 'Squid', sourceChain: 'Stellar', destinationChain: 'Ethereum', feeBase: 2.1, latencyMs: 6700 },
      { routeId: 'r-stable', providerId: 'AllBridge', sourceChain: 'Stellar', destinationChain: 'Ethereum', feeBase: 1.5, latencyMs: 4200 },
    ],
    primaryFailure: {
      failedRouteId: 'r-spiked',
      reason: 'fee_spike',
    },
    expected: {
      fallbackTriggered: true,
      fallbackReason: 'fee_spike',
      bestProvider: 'AllBridge',
    },
  },

  insufficientLiquidity: {
    id: 'insufficient-liquidity',
    description: 'Primary route has insufficient liquidity; fallback should recover with a liquid alternative',
    request: {
      sourceChain: 'Stellar',
      destinationChain: 'Solana',
      asset: 'USDC',
      amount: '100000.00',
      sender: 'GABCDE',
      recipient: 'SolRecipient',
    },
    routes: [
      { routeId: 'r-dry', providerId: 'AllBridge', sourceChain: 'Stellar', destinationChain: 'Solana', feeBase: 0.8, latencyMs: 3000 },
      { routeId: 'r-liquid', providerId: 'Wormhole', sourceChain: 'Stellar', destinationChain: 'Solana', feeBase: 1.2, latencyMs: 5100 },
    ],
    primaryFailure: {
      failedRouteId: 'r-dry',
      reason: 'insufficient_liquidity',
    },
    expected: {
      fallbackTriggered: true,
      fallbackReason: 'insufficient_liquidity',
    },
  },

  allProvidersDown: {
    id: 'all-providers-down',
    description: 'No routes registered for the requested chain pair; engine returns null',
    request: {
      sourceChain: 'Stellar',
      destinationChain: 'Ethereum',
      asset: 'USDC',
      amount: '1000.00',
      sender: 'GABCDE',
      recipient: '0xABCDE',
    },
    routes: [],
    expected: {
      noRouteFound: true,
    },
  },

  reverseDirection: {
    id: 'reverse-direction',
    description: 'Ethereum to Stellar USDC transfer — verifies routing works for the reverse path',
    request: {
      sourceChain: 'Ethereum',
      destinationChain: 'Stellar',
      asset: 'USDC',
      amount: '25000.00',
      sender: '0xABCDE',
      recipient: 'GABCDE',
    },
    routes: [
      { routeId: 'r-squid-stellar', providerId: 'Squid', sourceChain: 'Ethereum', destinationChain: 'Stellar', feeBase: 2.1, latencyMs: 6700 },
      { routeId: 'r-wormhole-stellar', providerId: 'Wormhole', sourceChain: 'Ethereum', destinationChain: 'Stellar', feeBase: 1.2, latencyMs: 5100 },
    ],
    expected: {
      bestProvider: 'Wormhole',
      maxFee: 2.5,
    },
  },

  singleProvider: {
    id: 'single-provider',
    description: 'Only one provider available — should select it without fallback',
    request: {
      sourceChain: 'Stellar',
      destinationChain: 'Base',
      asset: 'USDC',
      amount: '8000.00',
      sender: 'GABCDE',
      recipient: '0xABCDE',
    },
    routes: [
      { routeId: 'r-only', providerId: 'AllBridge', sourceChain: 'Stellar', destinationChain: 'Base', feeBase: 0.9, latencyMs: 3200 },
    ],
    expected: {
      bestProvider: 'AllBridge',
      fallbackTriggered: false,
    },
  },
};

export const SCENARIO_IDS = Object.keys(TRANSFER_SCENARIOS) as Array<keyof typeof TRANSFER_SCENARIOS>;
