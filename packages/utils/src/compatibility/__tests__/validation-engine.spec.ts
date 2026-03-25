/**
 * Route Validation Engine Tests
 */

import { RouteValidationEngine } from '../validation-engine';
import { TokenMappingRegistry } from '../token-mapping-registry';
import { TokenPair, TokenPairErrorCode, RouteCompatibilityRequest } from '../types';
import { ChainId, BridgeProvider } from '../../types';

describe('RouteValidationEngine', () => {
  let engine: RouteValidationEngine;
  let registry: TokenMappingRegistry;

  beforeEach(async () => {
    registry = new TokenMappingRegistry();
    engine = new RouteValidationEngine(registry);

    // Setup default chain pairs
    engine.registerSupportedChainPairs('hop', [
      ['ethereum', 'polygon'],
      ['ethereum', 'arbitrum'],
      ['polygon', 'ethereum'],
    ]);

    engine.registerSupportedChainPairs('layerzero', [
      ['ethereum', 'polygon'],
      ['ethereum', 'bsc'],
      ['bsc', 'ethereum'],
    ]);

    // Register tokens
    await registry.registerToken(
      'ethereum',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      {
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        addresses: { ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
        isStablecoin: true,
        isWrapped: false,
        supportedBridges: ['hop', 'layerzero'],
      },
    );

    await registry.registerToken(
      'polygon',
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      {
        symbol: 'USDC',
        name: 'USD Coin (PoS)',
        decimals: 6,
        addresses: { polygon: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
        isStablecoin: true,
        isWrapped: false,
        supportedBridges: ['hop', 'layerzero'],
      },
    );

    // Register mapping
    await registry.registerMapping(
      'ethereum',
      'polygon',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      'hop',
      {
        minAmount: '1000000',
        maxAmount: '1000000000000',
        conversionRate: '1000000000000000000',
      },
    );
  });

  afterEach(() => {
    registry.clear();
  });

  describe('Token Pair Validation', () => {
    it('should validate a supported token pair', async () => {
      const tokenPair: TokenPair = {
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        sourceDecimals: 6,
        destinationDecimals: 6,
        bridgeName: 'hop',
        minAmount: '1000000',
        maxAmount: '1000000000000',
      };

      const result = await engine.validateTokenPair(tokenPair);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject unsupported chain pair', async () => {
      const tokenPair: TokenPair = {
        sourceChain: 'ethereum',
        destinationChain: 'stellar',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: 'USDC',
        sourceDecimals: 6,
        destinationDecimals: 6,
        bridgeName: 'hop',
      };

      const result = await engine.validateTokenPair(tokenPair);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR)).toBe(
        true,
      );
    });

    it('should reject unregistered source token', async () => {
      const tokenPair: TokenPair = {
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xNonExistent',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        sourceDecimals: 6,
        destinationDecimals: 6,
        bridgeName: 'hop',
      };

      const result = await engine.validateTokenPair(tokenPair);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === TokenPairErrorCode.TOKEN_NOT_REGISTERED)).toBe(
        true,
      );
    });

    it('should reject unsupported token pair', async () => {
      // Register destination token but no mapping
      await registry.registerToken(
        'arbitrum',
        '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        {
          symbol: 'USDC',
          name: 'USD Coin (Arb)',
          decimals: 6,
          addresses: { arbitrum: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' },
          isStablecoin: true,
          isWrapped: false,
          supportedBridges: ['hop'],
        },
      );

      const tokenPair: TokenPair = {
        sourceChain: 'ethereum',
        destinationChain: 'arbitrum',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        sourceDecimals: 6,
        destinationDecimals: 6,
        bridgeName: 'hop',
      };

      const result = await engine.validateTokenPair(tokenPair);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === TokenPairErrorCode.UNSUPPORTED_TOKEN_PAIR)).toBe(
        true,
      );
    });

    it('should reject when bridge is not available', async () => {
      engine.setBridgeStatus('hop', false);

      const tokenPair: TokenPair = {
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        sourceDecimals: 6,
        destinationDecimals: 6,
        bridgeName: 'hop',
      };

      const result = await engine.validateTokenPair(tokenPair);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === TokenPairErrorCode.BRIDGE_NOT_AVAILABLE)).toBe(
        true,
      );
    });

    it('should reject when bridge is paused', async () => {
      engine.setBridgeStatus('hop', true, true);

      const tokenPair: TokenPair = {
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        sourceDecimals: 6,
        destinationDecimals: 6,
        bridgeName: 'hop',
      };

      const result = await engine.validateTokenPair(tokenPair);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === TokenPairErrorCode.BRIDGE_PAUSED)).toBe(true);
    });

    it('should include validation metadata', async () => {
      const tokenPair: TokenPair = {
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        sourceDecimals: 6,
        destinationDecimals: 6,
        bridgeName: 'hop',
        liquidityScore: 0.85,
      };

      const result = await engine.validateTokenPair(tokenPair);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.checkedBridges).toContain('hop');
      expect(result.metadata?.liquidityScore).toBe(0.85);
      expect(result.metadata?.validationTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Pre-validation', () => {
    it('should pre-validate a compatible request', async () => {
      const request: RouteCompatibilityRequest = {
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        amount: '1000000000',
      };

      const result = await engine.preValidateRequest(request);

      expect(result.isValid).toBe(true);
    });

    it('should fail pre-validation for unsupported chain pair', async () => {
      const request: RouteCompatibilityRequest = {
        sourceChain: 'ethereum',
        destinationChain: 'stellar',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: 'USDC',
        amount: '1000000000',
      };

      const result = await engine.preValidateRequest(request);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR)).toBe(
        true,
      );
    });

    it('should fail pre-validation for unregistered token', async () => {
      const request: RouteCompatibilityRequest = {
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xNonExistent',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        amount: '1000000000',
      };

      const result = await engine.preValidateRequest(request);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === TokenPairErrorCode.TOKEN_NOT_REGISTERED)).toBe(
        true,
      );
    });
  });

  describe('Compatible Routes', () => {
    it('should find compatible routes', async () => {
      const request: RouteCompatibilityRequest = {
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        amount: '1000000000',
      };

      const routes = await engine.findCompatibleRoutes(request);

      expect(routes.length).toBeGreaterThan(0);
      expect(routes[0].bridge).toBe('hop');
      expect(routes[0].isAvailable).toBe(true);
    });

    it('should filter routes by preferred bridges', async () => {
      const request: RouteCompatibilityRequest = {
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        amount: '1000000000',
        preferredBridges: ['hop'],
      };

      const routes = await engine.findCompatibleRoutes(request);

      expect(routes.every((r) => r.bridge === 'hop')).toBe(true);
    });

    it('should return empty array for unsupported route', async () => {
      const request: RouteCompatibilityRequest = {
        sourceChain: 'ethereum',
        destinationChain: 'stellar',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: 'USDC',
        amount: '1000000000',
      };

      const routes = await engine.findCompatibleRoutes(request);

      expect(routes).toHaveLength(0);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple token pairs', async () => {
      const tokenPairs: TokenPair[] = [
        {
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
          sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
          sourceDecimals: 6,
          destinationDecimals: 6,
          bridgeName: 'hop',
        },
        {
          sourceChain: 'ethereum',
          destinationChain: 'stellar',
          sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          destinationToken: 'USDC',
          sourceDecimals: 6,
          destinationDecimals: 6,
          bridgeName: 'hop',
        },
      ];

      const results = await engine.validateTokenPairs(tokenPairs);

      expect(results).toHaveLength(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(false);
    });
  });
});
