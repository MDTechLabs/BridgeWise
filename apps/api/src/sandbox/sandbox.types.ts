export enum SandboxScenario {
  SUCCESS = 'success',
  INSUFFICIENT_LIQUIDITY = 'insufficient_liquidity',
  SLIPPAGE_EXCEEDED = 'slippage_exceeded',
  ROUTE_UNAVAILABLE = 'route_unavailable',
  DESTINATION_REVERT = 'destination_revert',
  TIMEOUT = 'timeout',
  DELAYED_COMPLETION = 'delayed_completion',
}

export enum SandboxTransactionState {
  INITIALIZED = 'INITIALIZED',
  SUBMITTED = 'SUBMITTED',
  SOURCE_CONFIRMED = 'SOURCE_CONFIRMED',
  DESTINATION_PROCESSING = 'DESTINATION_PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export interface PartnerSandboxConfig {
  partnerId: string;
  activeScenario: SandboxScenario;
  simulatedLatencyMs: number;
  failureRate: number; // 0.0 to 1.0
  webhookUrl?: string;
  webhookSecret?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SandboxTransaction {
  id: string;
  partnerId: string;
  sourceChainId: number;
  destinationChainId: number;
  sourceToken: string;
  destinationToken: string;
  amount: string;
  estimatedOutput: string;
  netOutputAmount: string;
  feeAmount: string;
  feeToken: string;
  state: SandboxTransactionState;
  sourceTxHash: string;
  destinationTxHash?: string;
  scenario: SandboxScenario;
  failureReason?: string;
  steps: {
    name: string;
    status: 'pending' | 'success' | 'failed';
    timestamp: string;
    details?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface SandboxQuote {
  id: string;
  provider: string;
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  inputAmount: string;
  outputAmount: string;
  feeAmount: string;
  feeToken: string;
  netOutputAmount: string;
  estimatedTimeSeconds: number;
  isSandbox: true;
  scenario: SandboxScenario;
  routeSupported: boolean;
  error?: string;
}

export interface GetSandboxQuoteDto {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken?: string;
  amount: string;
  scenario?: SandboxScenario;
}

export interface CreateSandboxTxDto {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken?: string;
  amount: string;
  senderAddress: string;
  recipientAddress: string;
  scenario?: SandboxScenario;
}

export interface SetScenarioDto {
  scenario: SandboxScenario;
  simulatedLatencyMs?: number;
  failureRate?: number;
  webhookUrl?: string;
}

export interface FaucetRequestDto {
  address: string;
  token?: string;
  amount?: number;
}

export interface TestWebhookDto {
  webhookUrl?: string;
  eventType?: string;
  customPayload?: Record<string, any>;
}

export interface SandboxStatusResponse {
  sandboxMode: boolean;
  version: string;
  partnerId: string;
  activeScenario: SandboxScenario;
  supportedChains: { id: number; name: string; type: 'stellar' | 'evm' }[];
  supportedTokens: string[];
  faucetLimits: {
    maxPerRequest: number;
    tokens: string[];
  };
  scenarios: SandboxScenario[];
}
