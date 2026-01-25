import { FreighterProvider, WalletConnection, SignedTransaction } from "../wallet/FreighterProvider";
import { BridgeContract, BridgeOperationParams, BridgeOperationResult, SorobanAccount } from "../contracts/BridgeContract";

export interface BridgeTransactionDetails {
  sourceChain: string;
  targetChain: string;
  sourceAmount: string;
  destinationAmount: string;
  recipient: string;
  fee: string;
  estimatedTime: number;
}

export interface TransferExecutionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  details?: BridgeOperationResult;
}

export interface TransferOptions {
  slippage?: number;
  deadline?: number;
  gasLimit?: number;
  priorityFee?: string;
}

export class StellarBridgeExecutor {
  private wallet: FreighterProvider;
  private bridgeContract: BridgeContract;
  private horizonUrl: string;
  private walletConnection: WalletConnection | null = null;

  constructor(
    wallet: FreighterProvider,
    bridgeContract: BridgeContract,
    horizonUrl: string = "https://horizon.stellar.org"
  ) {
    this.wallet = wallet;
    this.bridgeContract = bridgeContract;
    this.horizonUrl = horizonUrl;
  }

  async executeTransfer(
    transfer: BridgeTransactionDetails,
    options: TransferOptions = {}
  ): Promise<TransferExecutionResult> {
    try {
      this.walletConnection = this.wallet.getConnection();
      if (!this.walletConnection || !this.walletConnection.isConnected) {
        throw new Error("Wallet not connected. Call connectWallet() first.");
      }

      const params: BridgeOperationParams = {
        sourceChain: transfer.sourceChain,
        targetChain: transfer.targetChain,
        amount: transfer.sourceAmount,
        recipient: transfer.recipient,
        slippage: options.slippage,
        deadline: options.deadline,
      };

      const sorobanAccount: SorobanAccount = {
        publicKey: this.walletConnection.publicKey,
        sequenceNumber: "1",
      };

      const preparedTx = await this.bridgeContract.prepareBridgeTransfer(params, sorobanAccount);
      const signedTx = await this.wallet.signTransaction(JSON.stringify(preparedTx));
      const result = await this.bridgeContract.submitBridgeTransfer(signedTx.signature);

      return {
        success: true,
        transactionHash: result.transactionHash,
        details: result,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: msg,
      };
    }
  }

  async estimateTransferCost(transfer: BridgeTransactionDetails): Promise<{
    networkFee: string;
    bridgeFee: string;
    totalFee: string;
    gasEstimate: string;
  }> {
    try {
      const params: BridgeOperationParams = {
        sourceChain: transfer.sourceChain,
        targetChain: transfer.targetChain,
        amount: transfer.sourceAmount,
        recipient: transfer.recipient,
      };

      const fees = await this.bridgeContract.estimateBridgeFees(params);

      return {
        networkFee: fees.baseFee,
        bridgeFee: fees.bridgeFee,
        totalFee: fees.totalFee,
        gasEstimate: "300000",
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error("Failed to estimate transfer cost: " + msg);
    }
  }

  async getTransferStatus(transactionHash: string): Promise<BridgeOperationResult> {
    try {
      return await this.bridgeContract.queryBridgeStatus(transactionHash);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error("Failed to get transfer status: " + msg);
    }
  }

  async connectAndPrepare(network: "mainnet" | "testnet" = "mainnet"): Promise<WalletConnection> {
    try {
      const connection = await this.wallet.connectWallet(network);
      this.walletConnection = connection;
      return connection;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error("Failed to connect wallet: " + msg);
    }
  }

  async getNetworkStats(): Promise<{
    baseFee: number;
    averageTime: number;
    pendingTransactions: number;
  }> {
    try {
      const url = this.horizonUrl + "/ledgers?order=desc&limit=1";
      const response = await fetch(url);
      const data = await response.json() as any;

      return {
        baseFee: data.records?.[0]?.base_fee_in_stroops || 100000,
        averageTime: 5,
        pendingTransactions: 0,
      };
    } catch (error) {
      return {
        baseFee: 100000,
        averageTime: 5,
        pendingTransactions: 0,
      };
    }
  }
}
