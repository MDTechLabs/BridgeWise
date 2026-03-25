/**
 * Token Pair Compatibility Service Tests
 */

import { TokenPairCompatibilityService } from '../compatibility-service';
import { TokenPairErrorCode } from '../types';

describe('TokenPairCompatibilityService', () => {
  let service: TokenPairCompatibilityService;

  beforeEach(async () => {
    service = new TokenPairCompatibilityService();

    // Register test tokens
    await service.registerToken(
      'ethereum',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      'USDC',
      6,
      ['hop', 'layerzero'],
    );

    await service.registerToken(
      'polygon',
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      'USDC',
      6,
      ['hop', 'layerzero'],
    );

    await service.registerToken(
      'ethereum',
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      'WETH',
      18,
      ['hop', 'layerzero'],
      { isWrapped: true, underlyingSymbol: 'ETH' },
    );

    // Register token mappings
    await service.registerTokenMapping(
      'ethereum',
      'polygon',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      'hop',
      {
        minAmount: '1000000',
        maxAmount: '1000000000000',
      },
    );

    await service.registerTokenMapping(
      'ethereum',
      'polygon',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      'layerzero',
      {
        minAmount: '500000',
        maxAmount: '500000000000',
      },
    );
  });

  describe('Service Initialization', () => {
    it('should initialize with default chain pairs', () => {
      const stats = service.getStats();

      expect(stats.config.defaultProviders).toContain('hop');
      expect(stats.config.defaultProviders).toContain('layerzero');
      expect(stats.config.defaultProviders).toContain('stellar');
    });

    it('should provide access to token registry', () => {
      const registry = service.getTokenRegistry();

      expect(registry).toBeDefined();
      expect(typeof registry.getToken).toBe('function');
    });

    it('should provide access to validation engine', () => {
      const engine = service.getValidationEngine();

      expect(engine).toBeDefined();
      expect(typeof engine.validateTokenPair).toBe('function');
    });
  });

  describe('Token Registration', () => {
    it('should register a new token', async () => {
      await service.registerToken(
        'ethereum',
        '0xNewToken',
        'NEW',
        18,
        ['hop'],
      );

      const registry = service.getTokenRegistry();
      const token = await registry.getToken('ethereum', 'NEW');

      expect(token?.symbol).toBe('NEW');
      expect(token?.decimals).toBe(18);
    });

    it('should register a wrapped token', async () => {
      await service.registerToken(
        'ethereum',
        '0xWrappedBTC',
        'WBTC',
        8,
        ['hop', 'layerzero'],
        { isWrapped: true, underlyingSymbol: 'BTC' },
      );

      const registry = service.getTokenRegistry();
      const token = await registry.getToken('ethereum', 'WBTC');

      expect(token?.isWrapped).toBe(true);
      expect(token?.underlyingToken).toBe('BTC');
    });
  });

  describe('Route Validation', () => {
    it('should validate a supported route', async () => {
      const result = await service.validateTokenPair({
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        sourceDecimals: 6,
        destinationDecimals: 6,
        bridgeName: 'hop',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject unsupported chain pair', async () => {
      const result = await service.validateTokenPair({
        sourceChain: 'ethereum',
        destinationChain: 'stellar',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: 'USDC',
        sourceDecimals: 6,
        destinationDecimals: 6,
        bridgeName: 'hop',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === TokenPairErrorCode.UNSUPPORTED_CHAIN_PAIR)).toBe(
        true,
      );
    });
  });

  describe('Pre-validation', () => {
    it('should pre-validate compatible request', async () => {
      const result = await service.preValidateRoute({
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        amount: '1000000000',
      });

      expect(result.isValid).toBe(true);
    });

    it('should fail pre-validation for unsupported route', async () => {
      const result = await service.preValidateRoute({
        sourceChain: 'ethereum',
        destinationChain: 'avalanche',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: 'USDC',
        amount: '1000000000',
      });

      expect(result.isValid).toBe(false);
    });
  });

  describe('Compatible Routes', () => {
    it('should find compatible routes', async () => {
      const routes = await service.findCompatibleRoutes({
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        amount: '1000000000',
      });

      expect(routes.length).toBeGreaterThan(0);
      expect(routes.some((r) => r.bridge === 'hop')).toBe(true);
    });

    it('should filter by preferred bridges', async () => {
      const routes = await service.findCompatibleRoutes({
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        amount: '1000000000',
        preferredBridges: ['hop'],
      });

      expect(routes.every((r) => r.bridge === 'hop')).toBe(true);
    });
  });

  describe('Bridge Status', () => {
    it('should update bridge status', async () => {
      service.setBridgeStatus('hop', false);

      const result = await service.validateTokenPair({
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        sourceDecimals: 6,
        destinationDecimals: 6,
        bridgeName: 'hop',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === TokenPairErrorCode.BRIDGE_NOT_AVAILABLE)).toBe(
        true,
      );
    });

    it('should handle paused bridges', async () => {
      service.setBridgeStatus('hop', true, true);

      const result = await service.validateTokenPair({
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        sourceToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        destinationToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        sourceDecimals: 6,
        destinationDecimals: 6,
        bridgeName: 'hop',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === TokenPairErrorCode.BRIDGE_PAUSED)).toBe(true);
    });
  });

  describe('Pair Support Check', () => {
    it('should return true for supported pair', async () => {
      const isSupported = await service.isPairSupported(
        'ethereum',
        'polygon',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        'hop',
      );

      expect(isSupported).toBe(true);
    });

    it('should return false for unsupported pair', async () => {
      const isSupported = await service.isPairSupported(
        'ethereum',
        'stellar',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'USDC',
        'hop',
      );

      expect(isSupported).toBe(false);
    });
  });

  describe('Supported Tokens', () => {
    it('should get supported tokens for route', async () => {
      const tokens = await service.getSupportedTokensForRoute(
        'ethereum',
        'polygon',
        'hop',
      );

      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should get supported tokens for all bridges', async () => {
      const tokens = await service.getSupportedTokensForRoute(
        'ethereum',
        'polygon',
      );

      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should return service statistics', () => {
      const stats = service.getStats();

      expect(stats.registry).toBeDefined();
      expect(stats.config).toBeDefined();
      expect(typeof stats.registry.totalTokens).toBe('number');
    });
  });
});
