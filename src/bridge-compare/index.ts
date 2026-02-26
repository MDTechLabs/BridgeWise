import { BridgeStatus, RankingMode } from '../enums';

export interface NormalizedQuote {
  bridgeId: string;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  inputAmount: number;
  outputAmount: number;
  totalFeeUsd: number;
  estimatedTimeSeconds: number;
  slippagePercent: number;
  reliabilityScore: number; // 0-100
  compositeScore: number;   // 0-100 (lower is better for cost, higher for balanced)
  rankingPosition: number;
  bridgeStatus: BridgeStatus;
  metadata: Record<string, unknown>;
  fetchedAt: Date;
}

export interface RawBridgeQuote {
  bridgeId: string;
  bridgeName: string;
  outputAmount: number;
  feesUsd: number;
  gasCostUsd: number;
  estimatedTimeSeconds: number;
  steps: BridgeStep[];
}

export interface BridgeStep {
  protocol: string;
  type: 'swap' | 'bridge' | 'wrap';
  inputAmount: number;
  outputAmount: number;
  feeUsd: number;
}

export interface SlippageEstimate {
  expectedSlippage: number;
  maxSlippage: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface ReliabilityMetrics {
  uptime24h: number;
  successRate7d: number;
  avgDelayPercent: number;
  incidentCount30d: number;
  reliabilityScore: number;
}

export interface RankingWeights {
  cost: number;
  speed: number;
  reliability: number;
  slippage: number;
}

export interface QuoteRequestParams {
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken?: string;
  amount: number;
  rankingMode: RankingMode;
  slippageTolerance?: number;
}

export interface QuoteResponse {
  quotes: NormalizedQuote[];
  bestRoute: NormalizedQuote;
  rankingMode: RankingMode;
  requestParams: QuoteRequestParams;
  totalProviders: number;
  successfulProviders: number;
  fetchDurationMs: number;
}

export interface BridgeProvider {
  id: string;
  name: string;
  apiBaseUrl: string;
  supportedChains: string[];
  supportedTokens: string[];
  isActive: boolean;
}
