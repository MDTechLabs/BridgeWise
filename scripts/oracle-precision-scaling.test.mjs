import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const now = 1700000000;

function validateChainlinkFeed(config, currentTime = now) {
  if (!config.aggregatorAddress || config.aggregatorAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error('ZERO_ADDRESS');
  }
  if (config.decimals < 1 || config.decimals > 18) {
    throw new Error('UNSUPPORTED_DECIMALS');
  }
  const rd = config.initialRoundData;
  if (rd.answer <= 0n) throw new Error('NON_POSITIVE_ANSWER');
  if (rd.roundId <= 0n) throw new Error('INVALID_ROUND');
  if (rd.answeredInRound < rd.roundId) throw new Error('INCOMPLETE_ROUND');
  if (rd.updatedAt === 0 || rd.updatedAt > currentTime) throw new Error('INVALID_TIMESTAMP');

  const scaleFactor = 10n ** BigInt(18 - config.decimals);
  const scaledPrice = rd.answer * scaleFactor;
  if (scaledPrice < 10n ** 6n) throw new Error('PRICE_UNDERFLOW');
  return { scaledPrice, scaleFactor };
}

function validateTwapConfig(config) {
  if (!config.poolAddress || config.poolAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error('ZERO_ADDRESS');
  }
  if (config.twapPeriod === 0 || config.twapPeriod > 86400 * 7) throw new Error('INVALID_TWAP_PERIOD');
  if (config.decimalAdjustment < -18 || config.decimalAdjustment > 18) throw new Error('INVALID_DECIMAL_ADJUSTMENT');
  if (config.sampleTick > 400000 || config.sampleTick < -400000) throw new Error('TICK_OUT_OF_RANGE');
  return { decimalAdjustment: config.decimalAdjustment };
}

function calculateDeviationBps(a, b) {
  if (a === 0n || b === 0n) return 2n ** 256n - 1n;
  if (a === b) return 0n;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return ((hi - lo) * 10000n) / lo;
}

function validateMultiOracleConfig(config, currentTime = now) {
  if (!config.primaryOracleAddress || config.primaryOracleAddress === '0x0000000000000000000000000000000000000000') throw new Error('ZERO_ADDRESS');
  if (!config.fallbackOracleAddress || config.fallbackOracleAddress === '0x0000000000000000000000000000000000000000') throw new Error('ZERO_ADDRESS');
  if (config.primaryOracleAddress.toLowerCase() === config.fallbackOracleAddress.toLowerCase()) throw new Error('DUPLICATE_ORACLE');
  if (config.maxDeviationBps === 0 || config.maxDeviationBps > 5000) throw new Error('INVALID_DEVIATION_CAP');
  if (config.maxPriceAge === 0) throw new Error('INVALID_MAX_AGE');
  if (config.primaryPrice <= 0n || config.fallbackPrice <= 0n) throw new Error('INVALID_PRICE');
  if (config.primaryUpdatedAt > currentTime || currentTime - config.primaryUpdatedAt > config.maxPriceAge) throw new Error('STALE_PRIMARY_FEED');
  if (config.fallbackUpdatedAt > currentTime || currentTime - config.fallbackUpdatedAt > config.maxPriceAge) throw new Error('STALE_FALLBACK_FEED');

  const deviationBps = calculateDeviationBps(config.primaryPrice, config.fallbackPrice);
  if (deviationBps > BigInt(config.maxDeviationBps)) throw new Error('INITIAL_DEVIATION_EXCEEDED');
  const verifiedPrice = config.primaryPrice > config.fallbackPrice ? config.primaryPrice : config.fallbackPrice;
  return { deviationBps, verifiedPrice };
}

describe('Oracle Decimal Scaling and Precision Configuration (#1477)', () => {
  const validFeed = {
    aggregatorAddress: '0x1111111111111111111111111111111111111111',
    decimals: 8,
    initialRoundData: {
      roundId: 100n,
      answer: 2000_0000_0000n,
      startedAt: now - 60,
      updatedAt: now - 30,
      answeredInRound: 100n,
    },
    description: 'ETH / USD',
  };

  it('accepts valid 8-decimal feed and scales to 18 decimals', () => {
    const res = validateChainlinkFeed(validFeed);
    assert.equal(res.scaleFactor, 10n ** 10n);
    assert.equal(res.scaledPrice, 2000_0000_0000n * 10n ** 10n);
  });

  it('rejects 0 decimals and > 18 decimals', () => {
    assert.throws(() => validateChainlinkFeed({ ...validFeed, decimals: 0 }), /UNSUPPORTED_DECIMALS/);
    assert.throws(() => validateChainlinkFeed({ ...validFeed, decimals: 19 }), /UNSUPPORTED_DECIMALS/);
  });

  it('rejects non-positive and incomplete round', () => {
    assert.throws(
      () => validateChainlinkFeed({ ...validFeed, initialRoundData: { ...validFeed.initialRoundData, answer: 0n } }),
      /NON_POSITIVE_ANSWER/
    );
    assert.throws(
      () => validateChainlinkFeed({ ...validFeed, initialRoundData: { ...validFeed.initialRoundData, roundId: 2n, answeredInRound: 1n } }),
      /INCOMPLETE_ROUND/
    );
  });

  it('validates TWAP bounds', () => {
    const validTwap = {
      poolAddress: '0x2222222222222222222222222222222222222222',
      twapPeriod: 1800,
      decimalAdjustment: 12,
      sampleTick: 1000,
    };
    assert.equal(validateTwapConfig(validTwap).decimalAdjustment, 12);
    assert.throws(() => validateTwapConfig({ ...validTwap, decimalAdjustment: 20 }), /INVALID_DECIMAL_ADJUSTMENT/);
    assert.throws(() => validateTwapConfig({ ...validTwap, poolAddress: '0x0000000000000000000000000000000000000000' }), /ZERO_ADDRESS/);
  });

  it('validates multi-oracle pair initial deviation', () => {
    const validMulti = {
      primaryOracleAddress: '0x3333333333333333333333333333333333333333',
      fallbackOracleAddress: '0x4444444444444444444444444444444444444444',
      primaryPrice: 2000n * 10n ** 18n,
      fallbackPrice: 2010n * 10n ** 18n,
      primaryUpdatedAt: now - 30,
      fallbackUpdatedAt: now - 20,
      maxDeviationBps: 200,
      maxPriceAge: 3600,
    };
    const res = validateMultiOracleConfig(validMulti);
    assert.equal(res.deviationBps, 50n);
    assert.equal(res.verifiedPrice, 2010n * 10n ** 18n);

    assert.throws(
      () => validateMultiOracleConfig({ ...validMulti, fallbackPrice: 2100n * 10n ** 18n }),
      /INITIAL_DEVIATION_EXCEEDED/
    );
  });
});
