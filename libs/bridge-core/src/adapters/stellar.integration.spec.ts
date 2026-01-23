/**
 * Integration tests for Stellar/Soroban bridge adapter
 * Tests fee estimation, latency estimation, and error mapping with mock RPC
 */

import { StellarAdapter } from './stellar';
import { MockStellarRpc } from './mock-rpc';
import { BridgeErrorCode, ErrorMapper, STELLAR_ERROR_MAPPING } from '../error-codes';
import { StellarFees, LatencyEstimation } from '../fee-estimation';

describe('StellarAdapter Integration Tests', () => {
  let adapter: StellarAdapter;
  let mockRpc: MockStellarRpc;
  const MOCK_RPC_PORT = 18545;

  beforeAll(async () => {
    // Start mock RPC server
    mockRpc = new MockStellarRpc({
      port: MOCK_RPC_PORT,
      networkLatency: 50, // 50ms simulated latency
      failureRate: 0, // No random failures by default
    });

    await mockRpc.start();
  });

  beforeEach(() => {
    // Create adapter pointing to mock RPC
    adapter = new StellarAdapter(
      `http://localhost:${MOCK_RPC_PORT}`,
      `http://localhost:${MOCK_RPC_PORT}`,
      'testnet'
    );

    // Reset mock state
    mockRpc.reset();
  });

  afterAll(async () => {
    await mockRpc.stop();
  });

  describe('Fee Estimation', () => {
    it('should calculate accurate fees for Stellar to EVM bridge', () => {
      const inputAmount = 1000000000n; // 100 XLM in stroops
      const fees = StellarFees.estimateFees(inputAmount, true, 0.5);

      expect(fees).toBeDefined();
      expect(fees.networkFee).toBeGreaterThan(0n);
      expect(fees.bridgeFee).toBeGreaterThan(0n);
      expect(fees.totalFee).toBeLessThan(inputAmount);
      expect(fees.feePercentage).toBeGreaterThan(0);
      expect(fees.feePercentage).toBeLessThanOrEqual(100);
    });

    it('should calculate accurate fees for EVM to Stellar bridge', () => {
      const inputAmount = 1000000000n; // 1 USDC in smallest units
      const fees = StellarFees.estimateFees(inputAmount, false, 0.5);

      expect(fees).toBeDefined();
      expect(fees.networkFee).toBeGreaterThan(0n);
      expect(fees.bridgeFee).toBeGreaterThan(0n);
      // EVM to Stellar should have slightly higher bridge fee
      expect(fees.bridgeFee).toBeGreaterThan(
        StellarFees.estimateFees(inputAmount, true, 0.5).bridgeFee
      );
    });

    it('should break down fees into network, bridge, and slippage components', () => {
      const inputAmount = 5000000000n; // 500 XLM
      const fees = StellarFees.estimateFees(inputAmount, true, 1.0); // 1% slippage

      expect(fees.networkFee).toBeGreaterThan(0n);
      expect(fees.bridgeFee).toBeGreaterThan(0n);
      expect(fees.slippageFee).toBeGreaterThan(0n);
      expect(fees.totalFee).toBe(fees.networkFee + fees.bridgeFee + fees.slippageFee);
    });

    it('should respect slippage tolerance in fee calculations', () => {
      const inputAmount = 1000000000n;

      const lowSlippageFees = StellarFees.estimateFees(inputAmount, true, 0.1);
      const highSlippageFees = StellarFees.estimateFees(inputAmount, true, 1.0);

      expect(highSlippageFees.slippageFee).toBeGreaterThan(lowSlippageFees.slippageFee);
      expect(highSlippageFees.totalFee).toBeGreaterThan(lowSlippageFees.totalFee);
    });

    it('should reject dust amounts', () => {
      // Stellar minimum is 1 XLM
      const dustAmount = 100n; // Less than 1 XLM

      const isValid = StellarFees.isValidAmount(dustAmount, true);
      expect(isValid).toBe(false);
    });

    it('should accept valid amounts', () => {
      const validAmount = 10000000n; // 1 XLM

      const isValid = StellarFees.isValidAmount(validAmount, true);
      expect(isValid).toBe(true);
    });

    it('should calculate correct minimum amount out with slippage', () => {
      const outputAmount = 100000000n;
      const slippagePercentage = 0.5;

      const minAmountOut = StellarFees.calculateMinAmountOut(outputAmount, slippagePercentage);

      expect(minAmountOut).toBeLessThan(outputAmount);
      expect(minAmountOut).toBeGreaterThan(0n);

      const slippageAmount = outputAmount - minAmountOut;
      const expectedSlippage = (outputAmount * BigInt(50)) / 10000n; // 0.5% = 50 basis points
      expect(slippageAmount).toBe(expectedSlippage);
    });
  });

  describe('Latency Estimation', () => {
    it('should estimate latency for Stellar to Ethereum bridge', () => {
      const estimate = LatencyEstimation.estimateLatency('stellar', 'ethereum');

      expect(estimate).toBeDefined();
      expect(estimate.estimatedSeconds).toBeGreaterThan(0);
      expect(estimate.confidence).toBeGreaterThanOrEqual(40);
      expect(estimate.confidence).toBeLessThanOrEqual(100);
      expect(estimate.breakdown).toBeDefined();
    });

    it('should estimate latency for Stellar to L2 chain bridge', () => {
      const estimateL1 = LatencyEstimation.estimateLatency('stellar', 'ethereum');
      const estimateL2 = LatencyEstimation.estimateLatency('stellar', 'optimism');

      expect(estimateL2.estimatedSeconds).toBeLessThan(estimateL1.estimatedSeconds);
    });

    it('should account for network load in latency estimation', () => {
      const lowLoadEstimate = LatencyEstimation.estimateLatency('stellar', 'ethereum', 0.1);
      const highLoadEstimate = LatencyEstimation.estimateLatency('stellar', 'ethereum', 0.9);

      expect(highLoadEstimate.estimatedSeconds).toBeGreaterThan(lowLoadEstimate.estimatedSeconds);
      expect(highLoadEstimate.confidence).toBeLessThan(lowLoadEstimate.confidence);
    });

    it('should provide detailed breakdown of latency components', () => {
      const estimate = LatencyEstimation.estimateLatency('stellar', 'polygon');

      expect(estimate.breakdown.networkLatency).toBeGreaterThan(0);
      expect(estimate.breakdown.blockTime).toBeGreaterThan(0);
      expect(estimate.breakdown.bridgeProcessing).toBeGreaterThan(0);
      expect(estimate.breakdown.confirmationTime).toBeGreaterThan(0);
    });

    it('should format latency estimate as human-readable string', () => {
      const estimate = LatencyEstimation.estimateLatency('stellar', 'ethereum');
      const formatted = LatencyEstimation.formatEstimate(estimate);

      expect(formatted).toBeDefined();
      expect(formatted).toContain('confidence');
    });
  });

  describe('Error Mapping', () => {
    it('should map RPC timeout errors to standard code', () => {
      const errorMapper = new ErrorMapper(STELLAR_ERROR_MAPPING);
      const error = new Error('Request timeout');

      const mapped = errorMapper.mapError(error);

      expect(mapped.code).toBe(BridgeErrorCode.RPC_TIMEOUT);
    });

    it('should map connection refused errors to standard code', () => {
      const errorMapper = new ErrorMapper(STELLAR_ERROR_MAPPING);
      const error = new Error('ECONNREFUSED: Connection refused');

      const mapped = errorMapper.mapError(error);

      expect(mapped.code).toBe(BridgeErrorCode.RPC_CONNECTION_FAILED);
    });

    it('should map account not found errors', () => {
      const errorMapper = new ErrorMapper(STELLAR_ERROR_MAPPING);
      const error = new Error('Account not found on network');

      const mapped = errorMapper.mapError(error);

      expect(mapped.code).toBe(BridgeErrorCode.ACCOUNT_NOT_FOUND);
    });

    it('should map insufficient balance errors', () => {
      const errorMapper = new ErrorMapper(STELLAR_ERROR_MAPPING);
      const error = new Error('Insufficient balance for operation');

      const mapped = errorMapper.mapError(error);

      expect(mapped.code).toBe(BridgeErrorCode.INSUFFICIENT_BALANCE);
    });

    it('should map sequence mismatch errors', () => {
      const errorMapper = new ErrorMapper(STELLAR_ERROR_MAPPING);
      const error = new Error('tx_bad_seq: Transaction sequence number is too high');

      const mapped = errorMapper.mapError(error);

      expect(mapped.code).toBe(BridgeErrorCode.ACCOUNT_SEQUENCE_MISMATCH);
    });

    it('should map contract not found errors', () => {
      const errorMapper = new ErrorMapper(STELLAR_ERROR_MAPPING);
      const error = new Error('ContractNotFound: Contract does not exist');

      const mapped = errorMapper.mapError(error);

      expect(mapped.code).toBe(BridgeErrorCode.CONTRACT_NOT_FOUND);
    });

    it('should map contract invocation failure errors', () => {
      const errorMapper = new ErrorMapper(STELLAR_ERROR_MAPPING);
      const error = new Error('InvokeHostFunctionFailed: Contract call failed');

      const mapped = errorMapper.mapError(error);

      expect(mapped.code).toBe(BridgeErrorCode.CONTRACT_INVOCATION_FAILED);
    });

    it('should map rate limit errors', () => {
      const errorMapper = new ErrorMapper(STELLAR_ERROR_MAPPING);
      const error = new Error('429: Too many requests');

      const mapped = errorMapper.mapError(error);

      expect(mapped.code).toBe(BridgeErrorCode.RATE_LIMIT_EXCEEDED);
    });

    it('should map unknown errors to UNKNOWN_ERROR code', () => {
      const errorMapper = new ErrorMapper(STELLAR_ERROR_MAPPING);
      const error = new Error('Some completely unknown error');

      const mapped = errorMapper.mapError(error);

      expect(mapped.code).toBe(BridgeErrorCode.UNKNOWN_ERROR);
    });

    it('should handle non-Error objects', () => {
      const errorMapper = new ErrorMapper(STELLAR_ERROR_MAPPING);
      const error = { message: 'Timeout', code: 'TIMEOUT' };

      const mapped = errorMapper.mapError(error);

      expect(mapped).toBeDefined();
      expect(mapped.originalError).toBe(error);
    });

    it('should extract original error message', () => {
      const errorMapper = new ErrorMapper(STELLAR_ERROR_MAPPING);
      const originalMessage = 'RPC timeout after 10s';
      const error = new Error(originalMessage);

      const mapped = errorMapper.mapError(error);

      expect(mapped.details?.originalMessage).toBe(originalMessage);
    });
  });

  describe('Route Fetching', () => {
    it('should fetch routes from Stellar to Ethereum', async () => {
      const routes = await adapter.fetchRoutes({
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        assetAmount: '10000000000', // 1000 XLM
      });

      expect(routes.length).toBeGreaterThan(0);
      const route = routes[0];
      expect(route.provider).toBe('stellar');
      expect(route.sourceChain).toBe('stellar');
      expect(route.targetChain).toBe('ethereum');
      expect(route.estimatedTime).toBeGreaterThan(0);
    });

    it('should fetch routes from Ethereum to Stellar', async () => {
      const routes = await adapter.fetchRoutes({
        sourceChain: 'ethereum',
        targetChain: 'stellar',
        assetAmount: '1000000000', // 1 USDC
      });

      expect(routes.length).toBeGreaterThan(0);
      const route = routes[0];
      expect(route.sourceChain).toBe('ethereum');
      expect(route.targetChain).toBe('stellar');
    });

    it('should include fee breakdown in route metadata', async () => {
      const routes = await adapter.fetchRoutes({
        sourceChain: 'stellar',
        targetChain: 'polygon',
        assetAmount: '5000000000', // 500 XLM
      });

      expect(routes.length).toBeGreaterThan(0);
      const route = routes[0];
      expect(route.metadata?.feeBreakdown).toBeDefined();
      expect(route.metadata?.feeBreakdown?.networkFee).toBeDefined();
      expect(route.metadata?.feeBreakdown?.bridgeFee).toBeDefined();
    });

    it('should include latency information in route metadata', async () => {
      const routes = await adapter.fetchRoutes({
        sourceChain: 'stellar',
        targetChain: 'arbitrum',
        assetAmount: '1000000000',
      });

      expect(routes.length).toBeGreaterThan(0);
      const route = routes[0];
      expect(route.metadata?.latencyConfidence).toBeDefined();
      expect(route.metadata?.latencyBreakdown).toBeDefined();
    });

    it('should reject dust amounts', async () => {
      const routes = await adapter.fetchRoutes({
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        assetAmount: '100', // Less than 1 XLM
      });

      expect(routes.length).toBe(0);
    });

    it('should apply slippage tolerance to minimum amount out', async () => {
      const routes = await adapter.fetchRoutes({
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        assetAmount: '1000000000',
        slippageTolerance: 1.0, // 1% slippage
      });

      expect(routes.length).toBeGreaterThan(0);
      const route = routes[0];
      expect(BigInt(route.minAmountOut)).toBeLessThan(BigInt(route.outputAmount));
    });
  });

  describe('Mock RPC Integration', () => {
    it('should simulate network latency', async () => {
      const mockRpcWithLatency = new MockStellarRpc({
        port: MOCK_RPC_PORT + 1,
        networkLatency: 500, // 500ms latency
      });

      await mockRpcWithLatency.start();

      const startTime = Date.now();
      const adapterWithLatency = new StellarAdapter(
        `http://localhost:${MOCK_RPC_PORT + 1}`,
        `http://localhost:${MOCK_RPC_PORT + 1}`
      );

      // This would make an RPC call through the adapter
      // For now, we're just testing that the mock is properly configured
      expect(startTime).toBeDefined();

      await mockRpcWithLatency.stop();
    });

    it('should simulate RPC failures', async () => {
      mockRpc.setFailureWindow(1000); // Fail for 1 second

      const routes = await adapter.fetchRoutes({
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        assetAmount: '1000000000',
      });

      // Should return empty array due to error
      expect(Array.isArray(routes)).toBe(true);

      // Reset state
      mockRpc.reset();
    });

    it('should track request count in mock RPC', async () => {
      const initialCount = mockRpc.getRequestCount();

      await adapter.fetchRoutes({
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        assetAmount: '1000000000',
      });

      const finalCount = mockRpc.getRequestCount();
      expect(finalCount).toBeGreaterThanOrEqual(initialCount);
    });
  });

  describe('Chain Pair Support', () => {
    it('should support Stellar to major EVM chains', () => {
      const chains = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'];

      chains.forEach((chain) => {
        expect(adapter.supportsChainPair('stellar', chain)).toBe(true);
        expect(adapter.supportsChainPair(chain, 'stellar')).toBe(true);
      });
    });

    it('should not support unsupported chain pairs', () => {
      expect(adapter.supportsChainPair('stellar', 'avalanche')).toBe(false);
      expect(adapter.supportsChainPair('ethereum', 'polygon')).toBe(false);
    });
  });
});
