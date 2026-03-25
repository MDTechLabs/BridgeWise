/**
 * Unit tests for MockBridgeAdapter
 *
 * These tests verify that the mock adapter:
 * - Implements the BridgeAdapter interface correctly
 * - Returns realistic mock data
 * - Supports sandbox mode for local testing
 * - Simulates network conditions (delay, failures)
 * - Can be used for testing other components
 */

import { MockBridgeAdapter, createMockAdapter } from '../adapters/mock';
import { RouteRequest } from '../types';

describe('MockBridgeAdapter', () => {
  let adapter: MockBridgeAdapter;

  beforeEach(() => {
    adapter = new MockBridgeAdapter();
  });

  afterEach(async () => {
    await adapter.shutdown();
  });

  describe('Basic Functionality', () => {
    it('should create an adapter instance', () => {
      expect(adapter).toBeDefined();
      expect(adapter.provider).toBe('hop');
    });

    it('should return correct name', () => {
      expect(adapter.getName()).toBe('Mock Bridge Adapter (Sandbox)');
    });

    it('should initialize and become ready', async () => {
      expect(adapter.isReady()).toBe(false);
      await adapter.initialize();
      expect(adapter.isReady()).toBe(true);
    });

    it('should shutdown and become not ready', async () => {
      await adapter.initialize();
      expect(adapter.isReady()).toBe(true);
      await adapter.shutdown();
      expect(adapter.isReady()).toBe(false);
    });

    it('should return configuration', () => {
      const config = adapter.getConfig();
      expect(config.provider).toBe('hop');
      expect(config.name).toBe('Mock Bridge Adapter (Sandbox)');
      expect(config.endpoints.primary).toBe('mock://localhost');
      expect(config.metadata?.sandboxMode).toBe(true);
      expect(config.metadata?.mockAdapter).toBe(true);
    });
  });

  describe('Chain Support', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should support ethereum to polygon', () => {
      expect(adapter.supportsChainPair('ethereum', 'polygon')).toBe(true);
    });

    it('should support polygon to ethereum', () => {
      expect(adapter.supportsChainPair('polygon', 'ethereum')).toBe(true);
    });

    it('should not support same chain pairs', () => {
      expect(adapter.supportsChainPair('ethereum', 'ethereum')).toBe(false);
    });

    it('should not support unsupported chain pairs', () => {
      expect(adapter.supportsChainPair('stellar', 'ethereum')).toBe(false);
    });

    it('should return supported source chains', () => {
      const chains = adapter.getSupportedSourceChains();
      expect(chains).toContain('ethereum');
      expect(chains).toContain('polygon');
      expect(chains).toContain('arbitrum');
      expect(chains).toContain('optimism');
    });

    it('should return supported destination chains for a source', () => {
      const destChains = adapter.getSupportedDestinationChains('ethereum');
      expect(destChains).toContain('polygon');
      expect(destChains).toContain('arbitrum');
      expect(destChains).toContain('optimism');
    });
  });

  describe('Token Support', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should support common token pairs', async () => {
      const supported = await adapter.supportsTokenPair(
        'ethereum',
        'polygon',
        'USDC',
        'USDC'
      );
      expect(supported).toBe(true);
    });

    it('should return supported tokens for a chain', async () => {
      const tokens = await adapter.getSupportedTokens('ethereum');
      expect(tokens).toContain('USDC');
      expect(tokens).toContain('USDT');
      expect(tokens).toContain('ETH');
    });

    it('should return token mapping', async () => {
      const mapping = await adapter.getTokenMapping(
        'ethereum',
        'polygon',
        'USDC'
      );
      expect(mapping).not.toBeNull();
      expect(mapping?.sourceToken).toBe('USDC');
      expect(mapping?.isSupported).toBe(true);
      expect(mapping?.sourceDecimals).toBe(18);
      expect(mapping?.destinationDecimals).toBe(18);
    });

    it('should return null for unsupported chain pairs', async () => {
      const mapping = await adapter.getTokenMapping(
        'stellar',
        'ethereum',
        'USDC'
      );
      expect(mapping).toBeNull();
    });
  });

  describe('Route Fetching', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    const validRequest: RouteRequest = {
      sourceChain: 'ethereum',
      targetChain: 'polygon',
      assetAmount: '1000000000000000000', // 1 ETH
      tokenAddress: '0xA0b86a33E6441e6C7D3D4B4f6c7E8f9a0B1c2D3e',
      slippageTolerance: 0.5,
    };

    it('should return routes for valid request', async () => {
      const routes = await adapter.fetchRoutes(validRequest);
      expect(routes.length).toBeGreaterThan(0);
    });

    it('should return route with correct structure', async () => {
      const routes = await adapter.fetchRoutes(validRequest);
      const route = routes[0];

      expect(route.id).toBeDefined();
      expect(route.provider).toBe('hop');
      expect(route.sourceChain).toBe('ethereum');
      expect(route.targetChain).toBe('polygon');
      expect(route.inputAmount).toBe(validRequest.assetAmount);
      expect(route.outputAmount).toBeDefined();
      expect(route.fee).toBeDefined();
      expect(route.feePercentage).toBe(0.5);
      expect(route.estimatedTime).toBeGreaterThan(0);
      expect(route.reliability).toBe(0.98);
      expect(route.minAmountOut).toBeDefined();
      expect(route.maxAmountOut).toBeDefined();
      expect(route.deadline).toBeDefined();
      expect(route.transactionData).toBeDefined();
      expect(route.metadata).toBeDefined();
    });

    it('should return empty array for unsupported chain pair', async () => {
      const request: RouteRequest = {
        sourceChain: 'stellar',
        targetChain: 'ethereum',
        assetAmount: '1000000000',
      };
      const routes = await adapter.fetchRoutes(request);
      expect(routes).toEqual([]);
    });

    it('should calculate output amount correctly', async () => {
      const routes = await adapter.fetchRoutes(validRequest);
      const route = routes[0];

      const input = BigInt(route.inputAmount);
      const output = BigInt(route.outputAmount);
      const fee = BigInt(route.fee);

      // input = output + fee
      expect(input).toBe(output + fee);
    });

    it('should track request count', async () => {
      expect(adapter.getRequestCount()).toBe(0);
      await adapter.fetchRoutes(validRequest);
      expect(adapter.getRequestCount()).toBe(1);
      await adapter.fetchRoutes(validRequest);
      expect(adapter.getRequestCount()).toBe(2);
    });

    it('should reset request count', async () => {
      await adapter.fetchRoutes(validRequest);
      expect(adapter.getRequestCount()).toBe(1);
      adapter.reset();
      expect(adapter.getRequestCount()).toBe(0);
    });
  });

  describe('Fee Estimation', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should return normalized fee', async () => {
      const fee = await adapter.getNormalizedFee('ethereum', 'polygon');
      expect(fee.total).toBeDefined();
      expect(fee.percentage).toBe(0.5);
      expect(fee.breakdown).toBeDefined();
      expect(fee.breakdown?.network).toBeDefined();
      expect(fee.breakdown?.protocol).toBeDefined();
      expect(fee.breakdown?.slippage).toBeDefined();
      expect(fee.lastUpdated).toBeGreaterThan(0);
    });

    it('should calculate fee based on amount', async () => {
      const amount = '1000000000000000000';
      const fee = await adapter.getNormalizedFee('ethereum', 'polygon', 'native', amount);
      expect(fee.total).toBeDefined();
      expect(BigInt(fee.total)).toBeGreaterThan(0);
    });
  });

  describe('Health Check', () => {
    it('should return healthy when initialized', async () => {
      await adapter.initialize();
      const health = await adapter.getHealth();
      expect(health.healthy).toBe(true);
      expect(health.uptime).toBe(99.9);
      expect(health.lastChecked).toBeGreaterThan(0);
    });

    it('should return not healthy when not initialized', async () => {
      const health = await adapter.getHealth();
      expect(health.healthy).toBe(false);
    });
  });

  describe('Network Simulation', () => {
    it('should simulate network delay', async () => {
      const delayMs = 100;
      adapter = new MockBridgeAdapter({ networkDelay: delayMs });
      await adapter.initialize();

      const start = Date.now();
      await adapter.fetchRoutes({
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '1000000000000000000',
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(delayMs);
    });

    it('should simulate failures with failure rate', async () => {
      // Create adapter that always fails
      adapter = new MockBridgeAdapter({ failureRate: 1 });
      await adapter.initialize();

      await expect(
        adapter.fetchRoutes({
          sourceChain: 'ethereum',
          targetChain: 'polygon',
          assetAmount: '1000000000000000000',
        })
      ).rejects.toThrow('[MockBridgeAdapter] Simulated API failure');
    });
  });

  describe('Custom Responses', () => {
    it('should return custom routes when configured', async () => {
      const customRoutes = [
        {
          id: 'custom-route-1',
          provider: 'hop' as const,
          sourceChain: 'ethereum' as const,
          targetChain: 'polygon' as const,
          inputAmount: '1000',
          outputAmount: '995',
          fee: '5',
          feePercentage: 0.5,
          estimatedTime: 300,
          reliability: 0.99,
          minAmountOut: '990',
          maxAmountOut: '995',
        },
      ];

      adapter = new MockBridgeAdapter({
        customResponses: { routes: customRoutes },
      });
      await adapter.initialize();

      const routes = await adapter.fetchRoutes({
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '1000',
      });

      expect(routes).toEqual(customRoutes);
    });

    it('should return custom fee when configured', async () => {
      const customFee = {
        total: '10000000000000000',
        percentage: 1.0,
        lastUpdated: Date.now(),
      };

      adapter = new MockBridgeAdapter({
        customResponses: { fees: customFee },
      });
      await adapter.initialize();

      const fee = await adapter.getNormalizedFee('ethereum', 'polygon');
      expect(fee.total).toBe(customFee.total);
      expect(fee.percentage).toBe(customFee.percentage);
    });

    it('should return custom health when configured', async () => {
      adapter = new MockBridgeAdapter({
        customResponses: {
          health: {
            healthy: false,
            uptime: 50,
            message: 'Custom health message',
          },
        },
      });
      await adapter.initialize();

      const health = await adapter.getHealth();
      expect(health.healthy).toBe(false);
      expect(health.uptime).toBe(50);
      expect(health.message).toBe('Custom health message');
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration at runtime', async () => {
      await adapter.initialize();

      // Initial request should succeed
      const routes1 = await adapter.fetchRoutes({
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '1000000000000000000',
      });
      expect(routes1.length).toBeGreaterThan(0);

      // Update to return empty routes
      adapter.updateConfig({
        customResponses: { routes: [] },
      });

      const routes2 = await adapter.fetchRoutes({
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '1000000000000000000',
      });
      expect(routes2).toEqual([]);
    });

    it('should update failure rate at runtime', async () => {
      await adapter.initialize();

      // Update to always fail
      adapter.updateConfig({ failureRate: 1 });

      await expect(
        adapter.fetchRoutes({
          sourceChain: 'ethereum',
          targetChain: 'polygon',
          assetAmount: '1000000000000000000',
        })
      ).rejects.toThrow();
    });
  });

  describe('Factory Function', () => {
    it('should create happy-path scenario adapter', () => {
      const mockAdapter = createMockAdapter('happy-path');
      expect(mockAdapter).toBeInstanceOf(MockBridgeAdapter);
    });

    it('should create slow-network scenario adapter', () => {
      const mockAdapter = createMockAdapter('slow-network');
      expect(mockAdapter).toBeInstanceOf(MockBridgeAdapter);
    });

    it('should create unreliable scenario adapter', () => {
      const mockAdapter = createMockAdapter('unreliable');
      expect(mockAdapter).toBeInstanceOf(MockBridgeAdapter);
    });

    it('should create empty-routes scenario adapter', async () => {
      const mockAdapter = createMockAdapter('empty-routes');
      await mockAdapter.initialize();

      const routes = await mockAdapter.fetchRoutes({
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '1000000000000000000',
      });
      expect(routes).toEqual([]);
    });
  });

  describe('Bridge Time Estimation', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should estimate L1 to L2 time correctly', async () => {
      const routes = await adapter.fetchRoutes({
        sourceChain: 'ethereum',
        targetChain: 'polygon',
        assetAmount: '1000000000000000000',
      });
      // L1 to L2 should be around 5 minutes (300 seconds)
      expect(routes[0].estimatedTime).toBe(300);
    });

    it('should estimate L2 to L1 time correctly', async () => {
      const routes = await adapter.fetchRoutes({
        sourceChain: 'polygon',
        targetChain: 'ethereum',
        assetAmount: '1000000000000000000',
      });
      // L2 to L1 should be around 5 minutes (300 seconds)
      expect(routes[0].estimatedTime).toBe(300);
    });

    it('should estimate L2 to L2 time correctly', async () => {
      const routes = await adapter.fetchRoutes({
        sourceChain: 'polygon',
        targetChain: 'arbitrum',
        assetAmount: '1000000000000000000',
      });
      // L2 to L2 should be around 3 minutes (180 seconds)
      expect(routes[0].estimatedTime).toBe(180);
    });
  });
});
