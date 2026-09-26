export type NetworkPreset =
  | 'public'
  | 'testnet'
  | 'futurenet'
  | 'sandbox'
  | 'custom';

export type StellarTemplateType =
  | 'payment'
  | 'dex'
  | 'nft'
  | 'soroban'
  | 'custom';

export interface StellarNetworkConfig {
  network: NetworkPreset;
  horizonUrl: string;
  rpcUrl?: string;
  passphrase: string;
  friendbotUrl?: string;
}

export interface StellarTemplateConfig {
  templateType: StellarTemplateType;
  network: NetworkPreset;
  sourceAccount: string;
  signingKey?: string;
  fee?: number;
  timeout?: number;
  memo?: string;
  customConfig?: Record<string, unknown>;
}

export interface TemplateVariable {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  required: boolean;
  defaultValue?: unknown;
  options?: string[];
}

export interface StellarTemplate {
  id: string;
  name: string;
  description: string;
  type: StellarTemplateType;
  version: string;
  variables: TemplateVariable[];
  generate(config: StellarTemplateConfig): unknown;
  validate?(config: StellarTemplateConfig): string[];
  getDefaults?(): Partial<StellarTemplateConfig>;
}

export interface SorobanOperation {
  contractId: string;
  functionName: string;
  args: Array<{
    name?: string;
    type: string;
    value: unknown;
  }>;
  simulated?: boolean;
  [key: string]: unknown;
}

export interface TemplateResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

export interface PaymentOperation {
  destination: string;
  amount: string;
  asset?: string;
  issuer?: string;
}

export interface DexOperation {
  sellAsset: string;
  buyAsset: string;
  sellAmount: string;
  minBuyAmount?: string;
  timeout?: number;
}

export interface NftOperation {
  contractId: string;
  tokenId?: string;
  operator?: string;
  spender?: string;
  from?: string;
  to?: string;
}
