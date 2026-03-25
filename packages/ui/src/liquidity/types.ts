export interface BridgeLiquidity {
  bridgeName: string;
  token: string;
  sourceChain: string;
  destinationChain: string;
  availableAmount: number;
  timestamp: Date;
}

export interface BridgeLiquidityQuery {
  token: string;
  sourceChain: string;
  destinationChain: string;
  bridgeName?: string;
}

export interface LiquidityProviderError {
  bridgeName: string;
  message: string;
}

export interface BridgeLiquidityProvider {
  name: string;
  fetchLiquidity: (query: BridgeLiquidityQuery) => Promise<BridgeLiquidity>;
}

export interface BridgeLiquidityMonitorConfig {
  providers?: BridgeLiquidityProvider[];
  storageKey?: string;
  minRefreshMs?: number;
}
