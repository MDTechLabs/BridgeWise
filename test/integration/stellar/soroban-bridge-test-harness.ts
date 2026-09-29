import {
  SorobanSandbox,
  SorobanSandboxOptions,
  SandboxTransaction,
} from '../../sandbox/stellar';
import {
  RawBridgeEvent,
  SorobanBridgeEventAggregator,
} from '../../../src/events/aggregation/stellar/soroban-bridge-event-aggregator';
import {
  StellarTransactionMetadataRecord,
  StellarTransactionMetadataIndexer,
} from '../../../src/indexing/transactions/stellar/stellar-transaction-metadata-indexer';
import {
  Route,
  SorobanSmartRoutingEngine,
} from '../../../src/routing/smart/stellar/soroban-smart-routing-engine';
import {
  SorobanContractCompatibilityValidator,
  ContractInfo,
} from '../../../src/validation/contracts/stellar/soroban-contract-compatibility-validator';
import { SorobanRpcQueue } from '../../../src/networking/rpc-queue/stellar/soroban-rpc-queue';
import { BridgeRoute } from '../../../src/services/route-ranker';
import type {
  BridgeProvider as PackageBridgeProvider,
  BridgeParams,
} from '../../../packages/bridge-providers';
import type {
  BridgeProvider as ApiBridgeProvider,
  BridgeQuote,
} from '../../../apps/api/src/providers/bridge-provider.service';

/**
 * Mock bridge provider class that implements both the PackageBridgeProvider
 * (for routing engine packages) and ApiBridgeProvider (for NestJS services).
 */
export class MockBridgeProvider
  implements PackageBridgeProvider, ApiBridgeProvider
{
  readonly name: string;
  readonly type = 'stellar' as const;
  private available = true;
  private routes: BridgeRoute[] = [];
  private quotes: Map<string, BridgeQuote> = new Map();

  constructor(name: string) {
    this.name = name;
  }

  // --- PackageBridgeProvider Implementation ---
  async getRoutes(params: BridgeParams): Promise<BridgeRoute[]> {
    return this.routes.filter(
      (r) =>
        r.fromChain === params.fromChain &&
        r.toChain === params.toChain &&
        r.fromToken === params.fromToken &&
        r.toToken === params.toToken,
    );
  }

  isAvailable(): boolean {
    return this.available;
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  getSupportedChains(): string[] {
    return Array.from(
      new Set(this.routes.flatMap((r) => [r.fromChain, r.toChain])),
    );
  }

  getSupportedTokens(): string[] {
    return Array.from(
      new Set(this.routes.flatMap((r) => [r.fromToken, r.toToken])),
    );
  }

  addRoute(route: BridgeRoute): void {
    this.routes.push(route);
  }

  // --- ApiBridgeProvider Implementation ---
  supportsRoute(fromChain: number, toChain: number, token: string): boolean {
    return this.routes.some(
      (r) =>
        r.fromChain === String(fromChain) &&
        r.toChain === String(toChain) &&
        r.fromToken === token,
    );
  }

  async getQuote(
    fromChain: number,
    toChain: number,
    token: string,
    amount: number,
  ): Promise<BridgeQuote> {
    const key = `${fromChain}-${toChain}-${token}-${amount}`;
    const cachedQuote = this.quotes.get(key);
    if (cachedQuote) return cachedQuote;

    if (!this.supportsRoute(fromChain, toChain, token)) {
      return {
        bridgeName: this.name,
        fromChain,
        toChain,
        token,
        inputAmount: amount,
        outputAmount: 0,
        totalFeeUSD: 0,
        estimatedTimeSeconds: 0,
        supported: false,
        error: 'Route not supported',
      };
    }

    const fee = amount * 0.005; // 0.5% fee
    return {
      bridgeName: this.name,
      fromChain,
      toChain,
      token,
      inputAmount: amount,
      outputAmount: amount - fee,
      totalFeeUSD: fee,
      estimatedTimeSeconds: 15,
      supported: true,
    };
  }

  setQuote(
    fromChain: number,
    toChain: number,
    token: string,
    amount: number,
    quote: BridgeQuote,
  ): void {
    const key = `${fromChain}-${toChain}-${token}-${amount}`;
    this.quotes.set(key, quote);
  }
}

/**
 * Reusable test harness for Soroban bridge integrations.
 * Coordinates sandbox state, smart contracts, validation, event streams, RPC queues, and indexing.
 */
export class SorobanBridgeTestHarness {
  public readonly sandbox: SorobanSandbox;
  public readonly eventAggregator: SorobanBridgeEventAggregator;
  public readonly indexer: StellarTransactionMetadataIndexer;
  public readonly routingEngine: SorobanSmartRoutingEngine;
  public readonly validator: SorobanContractCompatibilityValidator;
  public readonly rpcQueue: SorobanRpcQueue;

  private mockProviders: Map<string, MockBridgeProvider> = new Map();

  constructor(options?: {
    sandboxOptions?: SorobanSandboxOptions;
    flushIntervalMs?: number;
    maxConcurrency?: number;
  }) {
    this.sandbox = new SorobanSandbox(options?.sandboxOptions);
    this.eventAggregator = new SorobanBridgeEventAggregator({
      flushIntervalMs: options?.flushIntervalMs ?? 100, // shorter interval for fast tests
      bufferSize: 5,
    });
    this.indexer = new StellarTransactionMetadataIndexer();
    this.routingEngine = new SorobanSmartRoutingEngine();
    this.validator = new SorobanContractCompatibilityValidator();
    this.rpcQueue = new SorobanRpcQueue({
      maxConcurrency: options?.maxConcurrency ?? 3,
      maxRequestsPerSecond: 20,
      baseDelayMs: 20,
      maxDelayMs: 200,
      timeoutMs: 1500,
    });
  }

  /**
   * Set up a bridge contract on the sandbox with standard mock endpoints.
   */
  setupBridgeContract(
    contractId: string,
    options?: {
      lockImpl?: (args: unknown[]) => unknown;
      unlockImpl?: (args: unknown[]) => unknown;
      getFeeImpl?: (args: unknown[]) => unknown;
    },
  ): void {
    this.sandbox.registerContract(contractId, {
      lock:
        options?.lockImpl ??
        ((args: unknown[]) => {
          const [source, destination, asset, amount] = args as [
            string,
            string,
            string,
            string,
          ];
          // Deduct balance from source
          const srcBalance =
            this.sandbox.getAccount(source)?.balances[asset] ?? '0';
          if (Number(srcBalance) < Number(amount)) {
            throw new Error(`Insufficient balance: ${srcBalance} < ${amount}`);
          }
          const newBalance = (Number(srcBalance) - Number(amount)).toString();
          this.sandbox.setBalance(source, asset, newBalance);
          return { success: true, txHash: `lock_${Date.now()}` };
        }),
      unlock:
        options?.unlockImpl ??
        ((args: unknown[]) => {
          const [destination, asset, amount] = args as [string, string, string];
          // Add balance to destination
          const dstBalance =
            this.sandbox.getAccount(destination)?.balances[asset] ?? '0';
          const newBalance = (Number(dstBalance) + Number(amount)).toString();
          this.sandbox.setBalance(destination, asset, newBalance);
          return { success: true, txHash: `unlock_${Date.now()}` };
        }),
      get_fee:
        options?.getFeeImpl ??
        (() => {
          return '100'; // base fee in stroops
        }),
    });
  }

  /**
   * Registers and returns a new MockBridgeProvider.
   */
  createMockProvider(name: string): MockBridgeProvider {
    const provider = new MockBridgeProvider(name);
    this.mockProviders.set(name, provider);
    return provider;
  }

  /**
   * Retrieves a mock provider by name.
   */
  getMockProvider(name: string): MockBridgeProvider | undefined {
    return this.mockProviders.get(name);
  }

  /**
   * Executes a complete end-to-end bridge transfer, exercising the full integration stack.
   */
  async executeBridgeTransfer(params: {
    sourceAccount: string;
    destinationAccount: string;
    token: string;
    amount: string;
    bridgeContractId: string;
    sourceChain: string;
    destinationChain: string;
    providerName: string;
    contractVersion?: string;
    contractInterfaces?: string[];
  }): Promise<{
    txResult: any;
    destinationTxResult?: any;
    partialFailure?: string;
    eventCount: number;
    indexedRecord: StellarTransactionMetadataRecord | null;
  }> {
    // 1. Validate contract compatibility
    const contractInfo: ContractInfo = {
      contractId: params.bridgeContractId,
      wasmHash: 'wasm_hash_val_abc123',
      interfaces: params.contractInterfaces ?? [
        'SEP-41',
        'transfer',
        'balance',
        'approve',
      ],
      version: params.contractVersion ?? '1.0',
      network: 'testnet',
    };

    const valResult = this.validator.validate(contractInfo);
    if (!valResult.compatible) {
      throw new Error(
        `Bridge contract compatibility check failed: ${valResult.issues.map((i) => i.message).join(', ')}`,
      );
    }

    // 2. Submit transaction via the RPC queue
    const tx: SandboxTransaction = {
      source: params.sourceAccount,
      op: 'call',
      payload: {
        contractId: params.bridgeContractId,
        method: 'lock',
        args: [
          params.sourceAccount,
          params.destinationAccount,
          params.token,
          params.amount,
        ],
      },
    };

    const txResult = await this.rpcQueue.enqueue(async () => {
      const res = this.sandbox.submitTransaction(tx);
      if (res.kind !== 'tx') {
        throw new Error(`Expected transaction event, got ${res.kind}`);
      }
      if (res.status !== 'success') {
        throw new Error(`Sandbox submission failed: ${res.error}`);
      }
      return res;
    });

    // A source lock is only the first leg of a bridge transfer. Simulate the
    // destination release separately so the harness cannot report a completed
    // settlement while the recipient remains unpaid.
    let destinationTxResult: any;
    let partialFailure: string | undefined;
    try {
      const destinationTx: SandboxTransaction = {
        source: params.destinationAccount,
        op: 'call',
        payload: {
          contractId: params.bridgeContractId,
          method: 'unlock',
          args: [params.destinationAccount, params.token, params.amount],
        },
      };

      destinationTxResult = await this.rpcQueue.enqueue(async () => {
        const res = this.sandbox.submitTransaction(destinationTx);
        if (res.kind !== 'tx') {
          throw new Error(
            `Expected destination transaction event, got ${res.kind}`,
          );
        }
        if (res.status !== 'success') {
          throw new Error(`Destination submission failed: ${res.error}`);
        }
        return res;
      });
    } catch (error) {
      partialFailure = error instanceof Error ? error.message : String(error);
    }

    // 3. Ingest raw bridge event to simulator event aggregator
    const rawEvent: RawBridgeEvent = {
      source: params.providerName,
      type: 'transfer',
      payload: {
        from: params.sourceAccount,
        to: params.destinationAccount,
        amount: params.amount,
        asset: params.token,
      },
      timestamp: Date.now(),
      contractId: params.bridgeContractId,
    };

    const normalized = this.eventAggregator.ingest(rawEvent);

    if (txResult.kind !== 'tx') {
      throw new Error(`Expected transaction event for indexing metadata`);
    }

    // 4. Index the transaction metadata
    const record = this.indexer.storeMetadata({
      transactionId: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      txHash:
        (txResult.result as { txHash: string })?.txHash || `hash_${Date.now()}`,
      sourceChain: params.sourceChain,
      destinationChain: params.destinationChain,
      bridgeName: params.providerName,
      status: partialFailure ? 'partial' : 'completed',
      assetSymbol: params.token,
      amount: params.amount,
      metadata: {
        bridgeContractId: params.bridgeContractId,
        normalizedEventId: normalized.id,
        ...(partialFailure ? { destinationFailure: partialFailure } : {}),
        ...(destinationTxResult
          ? {
              destinationTxHash: (
                destinationTxResult.result as { txHash: string }
              )?.txHash,
            }
          : {}),
      },
    });

    return {
      txResult,
      destinationTxResult,
      partialFailure,
      eventCount: 1,
      indexedRecord: record,
    };
  }

  /**
   * Reset all components of the harness.
   */
  clear(): void {
    this.sandbox.reset();
    this.eventAggregator.destroy();
    this.indexer.clear();
    this.routingEngine.clearRoutes();
    this.rpcQueue.clear();
    this.mockProviders.clear();
  }
}
