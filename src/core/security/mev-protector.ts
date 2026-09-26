export interface MevProtectionParams {
  transactionValueUsd: number;
  publicRpcUrl: string;
  chain: string;
  enableMevProtection?: boolean;
}

export interface MevProtectionResult {
  selectedRpcUrl: string;
  isPrivateRpc: boolean;
  providerName: string;
}

export class MevProtector {
  public static readonly HIGH_VALUE_THRESHOLD_USD = 10000;

  private privateRpcEndpoints: Record<string, string> = {
    ethereum: 'https://rpc.flashbots.net',
    polygon: 'https://mevblocker.io',
    arbitrum: 'https://rpc.flashbots.net/fast',
  };

  /**
   * Determine RPC endpoint based on transaction value and network rules.
   */
  public selectRpcEndpoint(params: MevProtectionParams): MevProtectionResult {
    const isHighValue = params.transactionValueUsd >= MevProtector.HIGH_VALUE_THRESHOLD_USD;
    const mevEnabled = params.enableMevProtection ?? true;

    if (mevEnabled && isHighValue) {
      const privateRpc = this.privateRpcEndpoints[params.chain.toLowerCase()];
      if (privateRpc) {
        return {
          selectedRpcUrl: privateRpc,
          isPrivateRpc: true,
          providerName: 'Flashbots/MEV-Blocker Private RPC',
        };
      }
    }

    return {
      selectedRpcUrl: params.publicRpcUrl,
      isPrivateRpc: false,
      providerName: 'Standard Public RPC',
    };
  }
}
