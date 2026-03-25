import { Test, TestingModule } from '@nestjs/testing';
import { AcrossAdapter, HopAdapter, StargateAdapter } from '../src/adapters/bridge.adapters';
import { QuoteRequest } from '../src/interfaces/bridge-adapter.interface';

const baseRequest: QuoteRequest = {
  fromChain: 1,
  toChain: 137,
  token: 'USDC',
  amount: '1000',
};

describe('Bridge Adapters', () => {
  let across: AcrossAdapter;
  let hop: HopAdapter;
  let stargate: StargateAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AcrossAdapter, HopAdapter, StargateAdapter],
    }).compile();

    across = module.get<AcrossAdapter>(AcrossAdapter);
    hop = module.get<HopAdapter>(HopAdapter);
    stargate = module.get<StargateAdapter>(StargateAdapter);
  });

  // ─── AcrossAdapter ──────────────────────────────────────────────────────────

  describe('AcrossAdapter', () => {
    it('should have name "Across"', () => {
      expect(across.name).toBe('Across');
    });

    it('should support ETH→Polygon USDC route', () => {
      expect(across.supportsRoute(1, 137, 'USDC')).toBe(true);
    });

    it('should support ETH→Arbitrum WETH route', () => {
      expect(across.supportsRoute(1, 42161, 'WETH')).toBe(true);
    });

    it('should not support unsupported token on a valid route', () => {
      expect(across.supportsRoute(1, 137, 'SHIB')).toBe(false);
    });

    it('should not support unknown chain pair', () => {
      expect(across.supportsRoute(1, 99999, 'USDC')).toBe(false);
    });

    it('should return normalized quote with correct structure', async () => {
      const quote = await across.getQuote(baseRequest);

      expect(quote.bridgeName).toBe('Across');
      expect(quote.supported).toBe(true);
      expect(quote.totalFeeUSD).toBeGreaterThan(0);
      expect(quote.estimatedArrivalTime).toBe(120);
      expect(quote.feeToken).toBe('USDC');
      expect(parseFloat(quote.outputAmount)).toBeLessThan(1000);
      expect(parseFloat(quote.outputAmount)).toBeGreaterThan(0);
    }, 3000);

    it('should compute outputAmount as amount minus fees', async () => {
      const quote = await across.getQuote(baseRequest);
      const expected = 1000 - quote.totalFeeUSD;
      expect(Math.abs(parseFloat(quote.outputAmount) - expected)).toBeLessThan(0.01);
    }, 3000);
  });

  // ─── HopAdapter ─────────────────────────────────────────────────────────────

  describe('HopAdapter', () => {
    it('should have name "Hop"', () => {
      expect(hop.name).toBe('Hop');
    });

    it('should support ETH→Polygon USDC', () => {
      expect(hop.supportsRoute(1, 137, 'USDC')).toBe(true);
    });

    it('should support Polygon→Arbitrum USDT', () => {
      expect(hop.supportsRoute(137, 42161, 'USDT')).toBe(true);
    });

    it('should not support unavailable token', () => {
      expect(hop.supportsRoute(1, 137, 'WBTC')).toBe(false);
    });

    it('should return normalized quote', async () => {
      const quote = await hop.getQuote(baseRequest);

      expect(quote.bridgeName).toBe('Hop');
      expect(quote.supported).toBe(true);
      expect(quote.totalFeeUSD).toBeGreaterThan(0);
      expect(quote.estimatedArrivalTime).toBe(300);
      expect(parseFloat(quote.outputAmount)).toBeGreaterThan(0);
    }, 3000);

    it('should include gas cost in total fee', async () => {
      const quote = await hop.getQuote(baseRequest);
      // Hop always adds $2.5 gas cost, so totalFeeUSD > 2.5
      expect(quote.totalFeeUSD).toBeGreaterThan(2.5);
    }, 3000);
  });

  // ─── StargateAdapter ────────────────────────────────────────────────────────

  describe('StargateAdapter', () => {
    it('should have name "Stargate"', () => {
      expect(stargate.name).toBe('Stargate');
    });

    it('should support ETH→Polygon USDC', () => {
      expect(stargate.supportsRoute(1, 137, 'USDC')).toBe(true);
    });

    it('should support Arbitrum→Optimism ETH', () => {
      expect(stargate.supportsRoute(42161, 10, 'ETH')).toBe(true);
    });

    it('should not support DAI (no liquidity pool)', () => {
      expect(stargate.supportsRoute(1, 137, 'DAI')).toBe(false);
    });

    it('should return normalized quote', async () => {
      const quote = await stargate.getQuote(baseRequest);

      expect(quote.bridgeName).toBe('Stargate');
      expect(quote.supported).toBe(true);
      expect(quote.totalFeeUSD).toBeGreaterThan(0);
      expect(quote.estimatedArrivalTime).toBe(600);
      expect(parseFloat(quote.outputAmount)).toBeGreaterThan(0);
    }, 3000);

    it('should include LayerZero messaging fee', async () => {
      const quote = await stargate.getQuote(baseRequest);
      // LayerZero fee is $1.8, so total must exceed that
      expect(quote.totalFeeUSD).toBeGreaterThan(1.8);
    }, 3000);
  });

  // ─── Comparative checks ─────────────────────────────────────────────────────

  describe('Comparative', () => {
    it('Across should be faster than Hop and Stargate', async () => {
      const [acrossQ, hopQ, stargateQ] = await Promise.all([
        across.getQuote(baseRequest),
        hop.getQuote(baseRequest),
        stargate.getQuote(baseRequest),
      ]);

      expect(acrossQ.estimatedArrivalTime).toBeLessThan(hopQ.estimatedArrivalTime);
      expect(acrossQ.estimatedArrivalTime).toBeLessThan(stargateQ.estimatedArrivalTime);
    }, 5000);

    it('all adapters should return positive outputAmount', async () => {
      const quotes = await Promise.all([
        across.getQuote(baseRequest),
        hop.getQuote(baseRequest),
        stargate.getQuote(baseRequest),
      ]);

      quotes.forEach((q) => {
        expect(parseFloat(q.outputAmount)).toBeGreaterThan(0);
      });
    }, 5000);
  });
});
