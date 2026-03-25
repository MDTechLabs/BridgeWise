/**
 * Token Mapping Registry Tests
 */

import { TokenMappingRegistry } from '../token-mapping-registry';
import { CompatibilityTokenMetadata } from '../types';
import { ChainId, BridgeProvider } from '../../types';

describe('TokenMappingRegistry', () => {
  let registry: TokenMappingRegistry;

  beforeEach(() => {
    registry = new TokenMappingRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('Token Registration', () => {
    it('should register a token successfully', async () => {
      const metadata: CompatibilityTokenMetadata = {
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        addresses: { ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
        isStablecoin: true,
        isWrapped: false,
        supportedBridges: ['hop', 'layerzero'],
      };

      await registry.registerToken(
        'ethereum',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        metadata,
      );

      const token = await registry.getToken(
        'ethereum',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      );

      expect(token).not.toBeNull();
      expect(token?.symbol).toBe('USDC');
      expect(token?.decimals).toBe(6);
      expect(token?.isWrapped).toBe(false);
    });

    it('should retrieve token by symbol', async () => {
      const metadata: CompatibilityTokenMetadata = {
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        addresses: { ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
        isStablecoin: true,
        isWrapped: false,
        supportedBridges: ['hop'],
      };

      await registry.registerToken(
        'ethereum',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        metadata,
      );

      const token = await registry.getToken('ethereum', 'USDC');

      expect(token).not.toBeNull();
      expect(token?.symbol).toBe('USDC');
    });

    it('should return null for non-existent token', async () => {
      const token = await registry.getToken(
        'ethereum',
        '0xNonExistent',
      );

      expect(token).toBeNull();
    });

    it('should handle batch token registration', async () => {
      const tokens = [
        {
          chain: 'ethereum' as ChainId,
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          metadata: {
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            addresses: { ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
            isStablecoin: true,
            isWrapped: false,
            supportedBridges: ['hop'] as BridgeProvider[],
          },
        },
        {
          chain: 'ethereum' as ChainId,
          address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          metadata: {
            symbol: 'WETH',
            name: 'Wrapped Ether',
            decimals: 18,
            addresses: { ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
            isStablecoin: false,
            isWrapped: true,
            supportedBridges: ['hop', 'layerzero'] as BridgeProvider[],
          },
        },
      ];

      await registry.registerTokensBatch(tokens);

      const usdc = await registry.getToken('ethereum', 'USDC');
      const weth = await registry.getToken('ethereum', 'WETH');

      expect(usdc?.symbol).toBe('USDC');
      expect(weth?.symbol).toBe('WETH');
    });
  });

  describe('Token Mappings', () => {
    beforeEach(async () => {
      // Register source token
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
          supportedBridges: ['hop'],
        },
      );

      // Register destination token
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
          supportedBridges: ['hop'],
        },
      );
    });

    it('should register a token mapping', async () => {
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

      const mapping = await registry.getMapping(
        'ethereum',
        'polygon',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'hop',
      );

      expect(mapping).not.toBeNull();
      expect(mapping?.sourceToken.symbol).toBe('USDC');
      expect(mapping?.destinationToken.symbol).toBe('USDC');
      expect(mapping?.minAmount).toBe('1000000');
      expect(mapping?.isActive).toBe(true);
    });

    it('should check if token pair is bridgeable', async () => {
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

      const isBridgeable = await registry.isBridgeable(
        'ethereum',
        'polygon',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'hop',
      );

      expect(isBridgeable).toBe(true);
    });

    it('should return false for non-bridgeable tokens', async () => {
      const isBridgeable = await registry.isBridgeable(
        'ethereum',
        'polygon',
        '0xNonExistent',
        'hop',
      );

      expect(isBridgeable).toBe(false);
    });

    it('should update mapping status', async () => {
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

      await registry.updateMappingStatus(
        'ethereum',
        'polygon',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'hop',
        false,
      );

      const isBridgeable = await registry.isBridgeable(
        'ethereum',
        'polygon',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'hop',
      );

      expect(isBridgeable).toBe(false);
    });
  });

  describe('Wrapped Tokens', () => {
    it('should register wrapped token mapping', async () => {
      await registry.registerWrappedToken(
        'ethereum',
        'ETH',
        'WETH',
        'weth-contract',
      );

      const wrapped = await registry.getWrappedToken('ethereum', 'ETH');

      expect(wrapped).not.toBeNull();
      expect(wrapped?.originalToken).toBe('eth');
      expect(wrapped?.wrappedToken).toBe('weth');
      expect(wrapped?.isActive).toBe(true);
    });

    it('should return null for non-existent wrapped token', async () => {
      const wrapped = await registry.getWrappedToken('ethereum', 'NONEXISTENT');

      expect(wrapped).toBeNull();
    });
  });

  describe('Token Resolution', () => {
    beforeEach(async () => {
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
          supportedBridges: ['hop'],
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
          supportedBridges: ['hop'],
        },
      );
    });

    it('should resolve token symbol to addresses', async () => {
      const addresses = await registry.resolveTokenSymbol('USDC');

      expect(addresses.ethereum).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
      expect(addresses.polygon).toBe('0x2791bca1f2de4661ed88a30c99a7a9449aa84174');
    });

    it('should resolve token symbol for specific chains', async () => {
      const addresses = await registry.resolveTokenSymbol('USDC', ['ethereum']);

      expect(addresses.ethereum).toBeDefined();
      expect(addresses.polygon).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    it('should return correct statistics', async () => {
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
          supportedBridges: ['hop'],
        },
      );

      await registry.registerWrappedToken('ethereum', 'ETH', 'WETH');

      const stats = registry.getStats();

      expect(stats.totalTokens).toBe(1);
      expect(stats.chainsRegistered).toBe(1);
      expect(stats.wrappedTokensRegistered).toBe(1);
    });
  });
});
