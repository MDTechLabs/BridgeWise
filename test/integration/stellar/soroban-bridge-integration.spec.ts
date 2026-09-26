import { SorobanBridgeTestHarness } from './soroban-bridge-test-harness';
import { Route } from '../../../src/routing/smart/stellar/soroban-smart-routing-engine';

describe('Soroban Bridge Integration Test Harness', () => {
  let harness: SorobanBridgeTestHarness;

  beforeEach(() => {
    harness = new SorobanBridgeTestHarness({
      flushIntervalMs: 50,
      maxConcurrency: 2,
    });
  });

  afterEach(() => {
    harness.clear();
  });

  describe('End-to-End Bridge Transfer Flow', () => {
    it('should successfully execute a full bridge transfer cycle', async () => {
      // 1. Setup accounts with initial balances
      const sourceAccount = 'G_SENDER_ALICE';
      const destinationAccount = 'G_RECIPIENT_BOB';
      const asset = 'USDC';
      const bridgeContract = 'C_STELLAR_BRIDGE_ABC';

      harness.sandbox.createAccount(sourceAccount, {
        USDC: '500.0000000',
        XLM: '100.0000000',
      });
      harness.sandbox.createAccount(destinationAccount, {
        USDC: '10.0000000',
        XLM: '50.0000000',
      });

      // 2. Register mock bridge contract on the sandbox
      harness.setupBridgeContract(bridgeContract);

      // 3. Setup mock provider route configuration
      const provider = harness.createMockProvider('AllBridgeStellar');
      provider.addRoute({
        id: 'route-1',
        fromChain: '1001',
        toChain: '137',
        fromToken: 'USDC',
        toToken: 'USDC',
        amount: '100.0000000',
        fee: { amount: '2.5', token: 'USDC', usdValue: 2.5 },
        estimatedTime: 12,
        successRate: 0.99,
        provider: 'AllBridgeStellar',
        gasEstimate: { amount: '0.1', token: 'XLM', usdValue: 0.01 },
        slippage: 0.1,
        confidence: 0.95,
      });

      // 4. Run the end-to-end bridge transfer
      const result = await harness.executeBridgeTransfer({
        sourceAccount,
        destinationAccount,
        token: asset,
        amount: '100.0000000',
        bridgeContractId: bridgeContract,
        sourceChain: '1001',
        destinationChain: '137',
        providerName: 'AllBridgeStellar',
      });

      // 5. Verify the tx completed successfully
      expect(result.txResult.status).toBe('success');
      expect(result.eventCount).toBe(1);
      expect(result.indexedRecord).not.toBeNull();
      expect(result.indexedRecord?.bridgeName).toBe('AllBridgeStellar');
      expect(result.indexedRecord?.status).toBe('completed');
      expect(result.indexedRecord?.amount).toBe('100.0000000');

      // 6. Verify balances updated in the sandbox
      const aliceAfter = harness.sandbox.getAccount(sourceAccount);
      expect(aliceAfter?.balances[asset]).toBe('400'); // 500 - 100
      const bobAfter = harness.sandbox.getAccount(destinationAccount);
      expect(bobAfter?.balances[asset]).toBe('110'); // 10 + 100
      expect(result.destinationTxResult.status).toBe('success');
    });

    it('should report a partial settlement when destination release fails', async () => {
      const sourceAccount = 'G_ALICE';
      const destinationAccount = 'G_BOB';
      const asset = 'USDC';
      const bridgeContract = 'C_STELLAR_BRIDGE_ABC';

      harness.sandbox.createAccount(sourceAccount, { USDC: '150' });
      harness.sandbox.createAccount(destinationAccount, { USDC: '5' });
      harness.setupBridgeContract(bridgeContract, {
        unlockImpl: () => {
          throw new Error('Destination temporarily unavailable');
        },
      });
      harness.createMockProvider('AllBridgeStellar');

      const result = await harness.executeBridgeTransfer({
        sourceAccount,
        destinationAccount,
        token: asset,
        amount: '100',
        bridgeContractId: bridgeContract,
        sourceChain: '1001',
        destinationChain: '137',
        providerName: 'AllBridgeStellar',
      });

      expect(result.txResult.status).toBe('success');
      expect(result.destinationTxResult).toBeUndefined();
      expect(result.partialFailure).toContain(
        'Destination temporarily unavailable',
      );
      expect(result.indexedRecord?.status).toBe('partial');
      expect(result.indexedRecord?.metadata.destinationFailure).toContain(
        'Destination temporarily unavailable',
      );
      expect(harness.sandbox.getAccount(sourceAccount)?.balances[asset]).toBe(
        '50',
      );
      expect(
        harness.sandbox.getAccount(destinationAccount)?.balances[asset],
      ).toBe('5');
    });

    it('should throw an error if the source account lacks sufficient funds', async () => {
      const sourceAccount = 'G_ALICE';
      const destinationAccount = 'G_BOB';
      const asset = 'USDC';
      const bridgeContract = 'C_STELLAR_BRIDGE_ABC';

      harness.sandbox.createAccount(sourceAccount, { USDC: '5.0000000' });
      harness.sandbox.createAccount(destinationAccount, { USDC: '0' });
      harness.setupBridgeContract(bridgeContract);
      harness.createMockProvider('AllBridgeStellar');

      await expect(
        harness.executeBridgeTransfer({
          sourceAccount,
          destinationAccount,
          token: asset,
          amount: '100.0000000',
          bridgeContractId: bridgeContract,
          sourceChain: '1001',
          destinationChain: '137',
          providerName: 'AllBridgeStellar',
        }),
      ).rejects.toThrow(/Insufficient balance/);
    });
  });

  describe('Contract Compatibility Validator Integration', () => {
    it('should pass validation when contract interfaces and version are compatible', async () => {
      const mockContractInfo = {
        contractId: 'C_GOOD_BRIDGE',
        wasmHash: 'wasm_hash_1',
        interfaces: ['SEP-41', 'transfer', 'balance', 'approve'],
        version: '1.0',
        network: 'testnet' as const,
      };

      const result = harness.validator.validate(mockContractInfo);
      expect(result.compatible).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail validation and collect issues when required interfaces are missing', async () => {
      const mockContractInfo = {
        contractId: 'C_BAD_BRIDGE',
        wasmHash: 'wasm_hash_2',
        interfaces: ['SEP-41'], // missing transfer, balance, approve
        version: '1.0',
        network: 'testnet' as const,
      };

      const result = harness.validator.validate(mockContractInfo);
      expect(result.compatible).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.code === 'MISSING_INTERFACE')).toBe(
        true,
      );
    });

    it('should fail validation when version is unsupported', async () => {
      const mockContractInfo = {
        contractId: 'C_OLD_BRIDGE',
        wasmHash: 'wasm_hash_3',
        interfaces: ['SEP-41', 'transfer', 'balance', 'approve'],
        version: '0.0.1-beta', // unsupported version
        network: 'testnet' as const,
      };

      const result = harness.validator.validate(mockContractInfo);
      expect(result.compatible).toBe(false);
      expect(result.issues.some((i) => i.code === 'UNSUPPORTED_VERSION')).toBe(
        true,
      );
    });
  });

  describe('Smart Routing Engine Integration', () => {
    it('should rank routes correctly based on configured weights', () => {
      // 1. Setup routes in engine
      const routeCostPriority: Route = {
        id: 'route-cheap-slow',
        provider: 'CheapBridge',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 1.0, // very cheap
        estimatedTimeMs: 120000, // 2 min
        maxSlippage: 0.5,
      };

      const routeSpeedPriority: Route = {
        id: 'route-expensive-fast',
        provider: 'FastBridge',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 15.0, // expensive
        estimatedTimeMs: 15000, // 15 seconds
        maxSlippage: 0.5,
      };

      harness.routingEngine.registerRoutes([
        routeCostPriority,
        routeSpeedPriority,
      ]);
      harness.routingEngine.updateReliability('CheapBridge', 0.9);
      harness.routingEngine.updateReliability('FastBridge', 0.95);

      // 2. Query for optimal route prioritizing cost
      const costBest = harness.routingEngine.selectRoute({
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '100',
        sender: 'alice',
        recipient: 'bob',
        prioritize: 'cost',
      });

      expect(costBest).not.toBeNull();
      expect(costBest?.route.id).toBe('route-cheap-slow');

      // 3. Query for optimal route prioritizing speed
      const speedBest = harness.routingEngine.selectRoute({
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '100',
        sender: 'alice',
        recipient: 'bob',
        prioritize: 'speed',
      });

      expect(speedBest).not.toBeNull();
      expect(speedBest?.route.id).toBe('route-expensive-fast');
    });
  });

  describe('RPC Queue Dynamics and Resilience', () => {
    it('should handle request execution concurrency limits', async () => {
      const activePromises: Promise<number>[] = [];
      let concurrentExecutions = 0;
      let peakConcurrency = 0;

      const mockRpcRequest = (id: number) => {
        return async () => {
          concurrentExecutions++;
          peakConcurrency = Math.max(peakConcurrency, concurrentExecutions);
          await new Promise((resolve) => setTimeout(resolve, 30));
          concurrentExecutions--;
          return id;
        };
      };

      // Enqueue 4 requests (maxConcurrency is configured to 2)
      for (let i = 1; i <= 4; i++) {
        activePromises.push(harness.rpcQueue.enqueue(mockRpcRequest(i)));
      }

      const results = await Promise.all(activePromises);
      expect(results).toEqual([1, 2, 3, 4]);
      // Peak concurrent runs should not exceed configured limit of 2
      expect(peakConcurrency).toBeLessThanOrEqual(2);
    });

    it('should retry on retryable errors and log failures correctly', async () => {
      let callCount = 0;
      const failThenSucceedRequest = async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Rate limit exceeded (429)');
        }
        return 'success_val';
      };

      const result = await harness.rpcQueue.enqueue(
        failThenSucceedRequest,
        'HIGH',
      );
      expect(result).toBe('success_val');
      expect(callCount).toBe(2);

      const metrics = harness.rpcQueue.getMetrics();
      expect(metrics.retriedCount).toBe(1);
      expect(metrics.completedCount).toBe(1);
      expect(metrics.failedCount).toBe(0);
    });

    it('should fail after max retries exceed limits', async () => {
      let callCount = 0;
      const keepFailingRequest = async () => {
        callCount++;
        throw new Error('503 Service Unavailable');
      };

      // We expect this to reject since it will fail repeatedly
      await expect(
        harness.rpcQueue.enqueue(keepFailingRequest, 'MEDIUM'),
      ).rejects.toThrow(/503 Service Unavailable/);

      // Default maxRetries is 3, so total calls = 1 initial + 3 retries = 4 calls
      expect(callCount).toBe(4);

      const metrics = harness.rpcQueue.getMetrics();
      expect(metrics.failedCount).toBe(1);
      expect(metrics.retriedCount).toBe(3);
    });
  });
});
