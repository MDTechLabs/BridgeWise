import {
  OraclePrecisionValidator,
  ORACLE_CHAIN_PROFILES,
  ChainlinkFeedConfig,
  TwapPoolConfig,
  MultiOracleConfig,
} from './oracle-precision-scaling';

describe('Oracle Decimal Scaling and Precision Configuration (#1477)', () => {
  const now = 1700000000;

  describe('ChainlinkFeedConfig validation (OD-1, OD-2, OD-3, OD-4)', () => {
    const validFeed: ChainlinkFeedConfig = {
      aggregatorAddress: '0x1111111111111111111111111111111111111111',
      decimals: 8,
      initialRoundData: {
        roundId: 100n,
        answer: 2000_0000_0000n, // $2000.00000000
        startedAt: now - 60,
        updatedAt: now - 30,
        answeredInRound: 100n,
      },
      description: 'ETH / USD',
    };

    it('accepts valid 8-decimal feed and scales to 18 decimals', () => {
      const res = OraclePrecisionValidator.validateChainlinkFeed(validFeed, now);
      expect(res.scaleFactor).toBe(10n ** 10n);
      expect(res.scaledPrice).toBe(2000_0000_0000n * 10n ** 10n); // 2000 * 1e18
    });

    it('accepts valid 18-decimal feed with 1:1 scale factor', () => {
      const feed18: ChainlinkFeedConfig = {
        ...validFeed,
        decimals: 18,
        initialRoundData: {
          ...validFeed.initialRoundData,
          answer: 2000n * 10n ** 18n,
        },
      };
      const res = OraclePrecisionValidator.validateChainlinkFeed(feed18, now);
      expect(res.scaleFactor).toBe(1n);
      expect(res.scaledPrice).toBe(2000n * 10n ** 18n);
    });

    it('rejects zero address aggregator', () => {
      expect(() => {
        OraclePrecisionValidator.validateChainlinkFeed({
          ...validFeed,
          aggregatorAddress: '0x0000000000000000000000000000000000000000',
        }, now);
      }).toThrow(/ZERO_ADDRESS/);
    });

    it('rejects 0 decimals (OD-1)', () => {
      expect(() => {
        OraclePrecisionValidator.validateChainlinkFeed({
          ...validFeed,
          decimals: 0,
        }, now);
      }).toThrow(/UNSUPPORTED_DECIMALS/);
    });

    it('rejects > 18 decimals (OD-1)', () => {
      expect(() => {
        OraclePrecisionValidator.validateChainlinkFeed({
          ...validFeed,
          decimals: 19,
        }, now);
      }).toThrow(/UNSUPPORTED_DECIMALS/);
    });

    it('rejects zero or negative answer (OD-2)', () => {
      expect(() => {
        OraclePrecisionValidator.validateChainlinkFeed({
          ...validFeed,
          initialRoundData: { ...validFeed.initialRoundData, answer: 0n },
        }, now);
      }).toThrow(/NON_POSITIVE_ANSWER/);

      expect(() => {
        OraclePrecisionValidator.validateChainlinkFeed({
          ...validFeed,
          initialRoundData: { ...validFeed.initialRoundData, answer: -100n },
        }, now);
      }).toThrow(/NON_POSITIVE_ANSWER/);
    });

    it('rejects incomplete round (answeredInRound < roundId) (OD-2)', () => {
      expect(() => {
        OraclePrecisionValidator.validateChainlinkFeed({
          ...validFeed,
          initialRoundData: { ...validFeed.initialRoundData, roundId: 10n, answeredInRound: 9n },
        }, now);
      }).toThrow(/INCOMPLETE_ROUND/);
    });

    it('rejects future timestamp (OD-2)', () => {
      expect(() => {
        OraclePrecisionValidator.validateChainlinkFeed({
          ...validFeed,
          initialRoundData: { ...validFeed.initialRoundData, updatedAt: now + 500 },
        }, now);
      }).toThrow(/INVALID_TIMESTAMP/);
    });
  });

  describe('Uniswap V3 TWAP validation (OD-6)', () => {
    const validTwap: TwapPoolConfig = {
      poolAddress: '0x2222222222222222222222222222222222222222',
      twapPeriod: 1800,
      decimalAdjustment: 12,
      description: 'USDC/ETH TWAP',
      sampleTick: 200000,
    };

    it('accepts valid TWAP configuration', () => {
      const res = OraclePrecisionValidator.validateTwapConfig(validTwap);
      expect(res.decimalAdjustment).toBe(12);
    });

    it('rejects zero address pool', () => {
      expect(() => {
        OraclePrecisionValidator.validateTwapConfig({
          ...validTwap,
          poolAddress: '0x0000000000000000000000000000000000000000',
        });
      }).toThrow(/ZERO_ADDRESS/);
    });

    it('rejects zero TWAP period', () => {
      expect(() => {
        OraclePrecisionValidator.validateTwapConfig({
          ...validTwap,
          twapPeriod: 0,
        });
      }).toThrow(/INVALID_TWAP_PERIOD/);
    });

    it('rejects decimalAdjustment outside [-18, 18]', () => {
      expect(() => {
        OraclePrecisionValidator.validateTwapConfig({
          ...validTwap,
          decimalAdjustment: 19,
        });
      }).toThrow(/INVALID_DECIMAL_ADJUSTMENT/);

      expect(() => {
        OraclePrecisionValidator.validateTwapConfig({
          ...validTwap,
          decimalAdjustment: -19,
        });
      }).toThrow(/INVALID_DECIMAL_ADJUSTMENT/);
    });

    it('rejects tick out of supported bounds', () => {
      expect(() => {
        OraclePrecisionValidator.validateTwapConfig({
          ...validTwap,
          sampleTick: 400001,
        });
      }).toThrow(/TICK_OUT_OF_RANGE/);
    });
  });

  describe('Multi-oracle configuration and initial deviation (OD-5)', () => {
    const validMulti: MultiOracleConfig = {
      primaryOracleAddress: '0x3333333333333333333333333333333333333333',
      fallbackOracleAddress: '0x4444444444444444444444444444444444444444',
      primaryPrice: 2000n * 10n ** 18n,
      fallbackPrice: 2010n * 10n ** 18n, // 50 bps deviation
      primaryUpdatedAt: now - 30,
      fallbackUpdatedAt: now - 20,
      maxDeviationBps: 200,
      maxPriceAge: 3600,
      highValueThreshold: 100_000n * 10n ** 18n,
    };

    it('accepts matching oracle pair and returns higher price', () => {
      const res = OraclePrecisionValidator.validateMultiOracleConfig(validMulti, now);
      expect(res.deviationBps).toBe(50n);
      expect(res.verifiedPrice).toBe(2010n * 10n ** 18n);
    });

    it('rejects identical primary and fallback oracle addresses', () => {
      expect(() => {
        OraclePrecisionValidator.validateMultiOracleConfig({
          ...validMulti,
          fallbackOracleAddress: validMulti.primaryOracleAddress,
        }, now);
      }).toThrow(/DUPLICATE_ORACLE/);
    });

    it('rejects initial feeds exceeding deviation tolerance (OD-5)', () => {
      expect(() => {
        OraclePrecisionValidator.validateMultiOracleConfig({
          ...validMulti,
          fallbackPrice: 2100n * 10n ** 18n, // 500 bps > 200 bps
        }, now);
      }).toThrow(/INITIAL_DEVIATION_EXCEEDED/);
    });

    it('rejects stale feeds at configuration time', () => {
      expect(() => {
        OraclePrecisionValidator.validateMultiOracleConfig({
          ...validMulti,
          primaryUpdatedAt: now - 4000,
        }, now);
      }).toThrow(/STALE_PRIMARY_FEED/);
    });
  });

  describe('Supported chain profiles', () => {
    it('verifies all supported chains have valid oracle profiles', () => {
      expect(ORACLE_CHAIN_PROFILES.length).toBeGreaterThanOrEqual(7);
      for (const p of ORACLE_CHAIN_PROFILES) {
        expect(p.standardPriceDecimals).toBe(18);
        expect(p.maxFeedDecimals).toBe(18);
        expect(p.minPricePrecision).toBeGreaterThan(0n);
        expect(p.maxPriceAgeSeconds).toBeGreaterThan(0);
        expect(p.defaultMaxDeviationBps).toBe(200);
      }
    });
  });
});
