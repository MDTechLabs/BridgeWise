export interface QuoteRequest {
  fromChain: number;
  toChain: number;
  token: string;
  amount: string;
}

export interface NormalizedQuote {
  bridgeName: string;
  totalFeeUSD: number;
  feeToken: string;
  estimatedArrivalTime: number; // seconds
  outputAmount: string;
  score?: number;
  supported: boolean;
  error?: string;
}

export interface BridgeAdapter {
  readonly name: string;
  getQuote(request: QuoteRequest): Promise<NormalizedQuote>;
  supportsRoute(fromChain: number, toChain: number, token: string): boolean;
}
