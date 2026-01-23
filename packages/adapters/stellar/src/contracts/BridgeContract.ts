import axios from "axios";
import { Buffer } from "buffer";

export interface BridgeContractConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
}

export interface BridgeOperationParams {
  sourceChain: string;
  targetChain: string;
  amount: string;
  recipient: string;
  tokenAddress?: string;
  slippage?: number;
  deadline?: number;
}

export interface BridgeOperationResult {
  transactionHash: string;
  operationId: string;
  status: "pending" | "confirmed" | "failed";
  bridgeAmount: string;
  estimatedTime: number;
}

export interface SorobanAccount {
  publicKey: string;
  sequenceNumber: string;
  balances?: Array<{ asset: string; balance: string }>;
}

export class BridgeContract {
  private readonly config: BridgeContractConfig;
  private readonly rpcClient: any;

  constructor(config: BridgeContractConfig) {
    this.config = config;
    this.rpcClient = axios.create({
      baseURL: config.rpcUrl,
      headers: { "Content-Type": "application/json" },
    });
  }

  async prepareBridgeTransfer(
    params: BridgeOperationParams,
    sourceAccount: SorobanAccount
  ): Promise<Record<string, any>> {
    try {
      const preparedTx = {
        sourceAccount: sourceAccount.publicKey,
        contractId: this.config.contractId,
        operation: "bridge",
        params: {
          sourceChain: params.sourceChain,
          targetChain: params.targetChain,
          amount: params.amount,
          recipient: params.recipient,
          slippage: params.slippage || 0.005,
        },
        networkPassphrase: this.config.networkPassphrase,
        fee: 100000,
        timebounds: {
          minTime: Math.floor(Date.now() / 1000),
          maxTime: Math.floor(Date.now() / 1000) + 600,
        },
      };
      return preparedTx;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error("Failed to prepare bridge transfer: " + msg);
    }
  }

  async submitBridgeTransfer(signedTransaction: string): Promise<BridgeOperationResult> {
    try {
      const response = await this.rpcClient.post("/transactions", { tx: signedTransaction });
      return {
        transactionHash: response.data.hash || response.data.id,
        operationId: response.data.id || ("bridge-" + Date.now()),
        status: "pending",
        bridgeAmount: response.data.amount || "0",
        estimatedTime: response.data.estimatedTime || 30000,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error("Failed to submit bridge transfer: " + msg);
    }
  }

  async queryBridgeStatus(operationId: string): Promise<BridgeOperationResult> {
    try {
      const url = "/operations/" + operationId;
      const response = await this.rpcClient.get(url);
      const statusMap: Record<string, "pending" | "confirmed" | "failed"> = {
        pending: "pending",
        confirmed: "confirmed",
        success: "confirmed",
        failed: "failed",
        error: "failed",
      };
      return {
        transactionHash: response.data.hash,
        operationId: response.data.id,
        status: statusMap[response.data.status] || "pending",
        bridgeAmount: response.data.bridgeAmount || "0",
        estimatedTime: response.data.estimatedTime || 0,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error("Failed to query bridge status: " + msg);
    }
  }

  async estimateBridgeFees(params: BridgeOperationParams): Promise<Record<string, string>> {
    try {
      const amount = BigInt(params.amount);
      const baseFee = BigInt(100000);
      const bridgeFee = amount / BigInt(1000);
      const totalFee = baseFee + bridgeFee;
      return {
        baseFee: baseFee.toString(),
        bridgeFee: bridgeFee.toString(),
        totalFee: totalFee.toString(),
        feePercentage: "0.1",
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error("Failed to estimate bridge fees: " + msg);
    }
  }

  private createBridgeArgs(params: BridgeOperationParams): Buffer[] {
    const args: Buffer[] = [];
    args.push(Buffer.from(params.sourceChain));
    args.push(Buffer.from(params.targetChain));
    args.push(Buffer.from(params.amount));
    args.push(Buffer.from(params.recipient));
    if (params.tokenAddress) {
      args.push(Buffer.from(params.tokenAddress));
    }
    if (params.slippage !== undefined) {
      args.push(Buffer.from(String(params.slippage)));
    }
    return args;
  }
}
