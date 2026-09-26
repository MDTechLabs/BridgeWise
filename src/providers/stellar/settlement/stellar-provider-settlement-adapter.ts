import {
  StellarBridgeProviderSandboxAdapter,
} from '../stellar-bridge-provider-sandbox-adapter';
import type {
  BridgeQuote,
  BridgeExecutionResult,
} from '../stellar-bridge-provider-sandbox-adapter';

export class StellarProviderSettlementAdapter extends StellarBridgeProviderSandboxAdapter {
  quoteSettlement(
    amount: string,
    fromAsset: string,
    toAsset: string,
    sourceChain: string,
    destinationChain: string,
  ): Promise<BridgeQuote> {
    return this.getQuote(amount, fromAsset, toAsset, sourceChain, destinationChain);
  }

  executeSettlement(sourceTxHash: string, quote: BridgeQuote): Promise<BridgeExecutionResult> {
    return this.executeTransfer(sourceTxHash, quote);
  }
}
