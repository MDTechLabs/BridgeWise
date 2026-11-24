/**
 * Executable reference model for Oracle Decimal Scaling and Precision
 * Configuration Validation.
 *
 * Implements Issue #1477:
 *  - Validate oracle decimal scaling and precision at configuration time
 *
 * Specification: `docs/ORACLE_DECIMAL_SCALING_AND_PRECISION_SPEC.md`
 */

export const ORACLE_PRECISION_INVARIANTS = [
  'OD-1', // Bounded Decimal Range [1, 18]
  'OD-2', // Configuration Liveness Probe
  'OD-3', // Exact 18-Decimal Normalization
  'OD-4', // Precision Underflow Protection
  'OD-5', // Initial Pair Agreement Check
  'OD-6', // Bounded TWAP Decimal Adjustment [-18, 18]
] as const;

export type OraclePrecisionInvariantId = (typeof ORACLE_PRECISION_INVARIANTS)[number];

export interface ChainOracleProfile {
  readonly chainId: string;
  readonly parameterSetVersion: string;
  readonly standardPriceDecimals: number;
  readonly maxFeedDecimals: number;
  readonly minPricePrecision: bigint;
  readonly maxPriceBound: bigint;
  readonly maxPriceAgeSeconds: number;
  readonly defaultMaxDeviationBps: number;
  readonly parameterSource: string;
}

export const ORACLE_CHAIN_PROFILES: readonly ChainOracleProfile[] = [
  { chainId: 'evm:1', parameterSetVersion: 'oracle-risk/1.0.0', standardPriceDecimals: 18, maxFeedDecimals: 18, minPricePrecision: 10n ** 6n, maxPriceBound: 10n ** 36n, maxPriceAgeSeconds: 3600, defaultMaxDeviationBps: 200, parameterSource: 'oracle-risk:1' },
  { chainId: 'evm:137', parameterSetVersion: 'oracle-risk/1.0.0', standardPriceDecimals: 18, maxFeedDecimals: 18, minPricePrecision: 10n ** 6n, maxPriceBound: 10n ** 36n, maxPriceAgeSeconds: 1800, defaultMaxDeviationBps: 200, parameterSource: 'oracle-risk:137' },
  { chainId: 'evm:56', parameterSetVersion: 'oracle-risk/1.0.0', standardPriceDecimals: 18, maxFeedDecimals: 18, minPricePrecision: 10n ** 6n, maxPriceBound: 10n ** 36n, maxPriceAgeSeconds: 1800, defaultMaxDeviationBps: 200, parameterSource: 'oracle-risk:56' },
  { chainId: 'evm:42161', parameterSetVersion: 'oracle-risk/1.0.0', standardPriceDecimals: 18, maxFeedDecimals: 18, minPricePrecision: 10n ** 6n, maxPriceBound: 10n ** 36n, maxPriceAgeSeconds: 3600, defaultMaxDeviationBps: 200, parameterSource: 'oracle-risk:42161' },
  { chainId: 'evm:10', parameterSetVersion: 'oracle-risk/1.0.0', standardPriceDecimals: 18, maxFeedDecimals: 18, minPricePrecision: 10n ** 6n, maxPriceBound: 10n ** 36n, maxPriceAgeSeconds: 3600, defaultMaxDeviationBps: 200, parameterSource: 'oracle-risk:10' },
  { chainId: 'evm:8453', parameterSetVersion: 'oracle-risk/1.0.0', standardPriceDecimals: 18, maxFeedDecimals: 18, minPricePrecision: 10n ** 6n, maxPriceBound: 10n ** 36n, maxPriceAgeSeconds: 3600, defaultMaxDeviationBps: 200, parameterSource: 'oracle-risk:8453' },
  { chainId: 'soroban:stellar', parameterSetVersion: 'oracle-risk/1.0.0', standardPriceDecimals: 18, maxFeedDecimals: 18, minPricePrecision: 10n ** 6n, maxPriceBound: 10n ** 36n, maxPriceAgeSeconds: 300, defaultMaxDeviationBps: 200, parameterSource: 'oracle-risk:stellar' },
];

export class OracleConfigurationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'OracleConfigurationError';
  }
}

export interface FeedRoundData {
  roundId: bigint;
  answer: bigint;
  startedAt: number;
  updatedAt: number;
  answeredInRound: bigint;
}

export interface ChainlinkFeedConfig {
  aggregatorAddress: string;
  decimals: number;
  initialRoundData: FeedRoundData;
  description: string;
}

export interface TwapPoolConfig {
  poolAddress: string;
  twapPeriod: number;
  decimalAdjustment: number;
  description: string;
  sampleTick: number;
}

export interface MultiOracleConfig {
  primaryOracleAddress: string;
  fallbackOracleAddress: string;
  primaryPrice: bigint;
  fallbackPrice: bigint;
  primaryUpdatedAt: number;
  fallbackUpdatedAt: number;
  maxDeviationBps: number;
  maxPriceAge: number;
  highValueThreshold: bigint;
}

export class OraclePrecisionValidator {
  /**
   * Validates Chainlink aggregator configuration at configuration time.
   * Enforces OD-1, OD-2, OD-3, OD-4.
   */
  static validateChainlinkFeed(
    config: ChainlinkFeedConfig,
    now: number = Math.floor(Date.now() / 1000)
  ): { scaledPrice: bigint; scaleFactor: bigint } {
    if (!config.aggregatorAddress || config.aggregatorAddress === '0x0000000000000000000000000000000000000000') {
      throw new OracleConfigurationError('ZERO_ADDRESS', 'Aggregator address cannot be zero');
    }

    if (config.decimals < 1 || config.decimals > 18) {
      throw new OracleConfigurationError(
        'UNSUPPORTED_DECIMALS',
        `Feed decimals ${config.decimals} must be between 1 and 18`
      );
    }

    const rd = config.initialRoundData;
    if (rd.answer <= 0n) {
      throw new OracleConfigurationError('NON_POSITIVE_ANSWER', `Feed answer must be positive: got ${rd.answer}`);
    }

    if (rd.roundId <= 0n) {
      throw new OracleConfigurationError('INVALID_ROUND', `Round ID must be positive: got ${rd.roundId}`);
    }

    if (rd.answeredInRound < rd.roundId) {
      throw new OracleConfigurationError(
        'INCOMPLETE_ROUND',
        `Round ${rd.roundId} answered in earlier round ${rd.answeredInRound}`
      );
    }

    if (rd.updatedAt === 0 || rd.updatedAt > now) {
      throw new OracleConfigurationError(
        'INVALID_TIMESTAMP',
        `Reported timestamp ${rd.updatedAt} is invalid (now: ${now})`
      );
    }

    const scaleFactor = 10n ** BigInt(18 - config.decimals);
    const scaledPrice = rd.answer * scaleFactor;

    if (scaledPrice < 10n ** 6n) {
      throw new OracleConfigurationError(
        'PRICE_UNDERFLOW',
        `Scaled price ${scaledPrice} is below minimum resolution threshold`
      );
    }

    return { scaledPrice, scaleFactor };
  }

  /**
   * Validates Uniswap V3 TWAP oracle configuration at configuration time.
   * Enforces OD-6.
   */
  static validateTwapConfig(config: TwapPoolConfig): { decimalAdjustment: number } {
    if (!config.poolAddress || config.poolAddress === '0x0000000000000000000000000000000000000000') {
      throw new OracleConfigurationError('ZERO_ADDRESS', 'TWAP pool address cannot be zero');
    }

    if (config.twapPeriod === 0 || config.twapPeriod > 86400 * 7) {
      throw new OracleConfigurationError('INVALID_TWAP_PERIOD', `Twap period ${config.twapPeriod} out of range [1, 604800]`);
    }

    if (config.decimalAdjustment < -18 || config.decimalAdjustment > 18) {
      throw new OracleConfigurationError(
        'INVALID_DECIMAL_ADJUSTMENT',
        `Decimal adjustment ${config.decimalAdjustment} must be in [-18, 18]`
      );
    }

    if (config.sampleTick > 400000 || config.sampleTick < -400000) {
      throw new OracleConfigurationError('TICK_OUT_OF_RANGE', `Tick ${config.sampleTick} exceeds MAX_SUPPORTED_TICK`);
    }

    return { decimalAdjustment: config.decimalAdjustment };
  }

  /**
   * Calculates deviation in basis points against the smaller price.
   */
  static calculateDeviationBps(a: bigint, b: bigint): bigint {
    if (a === 0n || b === 0n) return 2n ** 256n - 1n;
    if (a === b) return 0n;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return ((hi - lo) * 10_000n) / lo;
  }

  /**
   * Validates multi-oracle pair configuration at configuration time.
   * Enforces OD-2, OD-4, OD-5.
   */
  static validateMultiOracleConfig(
    config: MultiOracleConfig,
    now: number = Math.floor(Date.now() / 1000)
  ): { deviationBps: bigint; verifiedPrice: bigint } {
    if (!config.primaryOracleAddress || config.primaryOracleAddress === '0x0000000000000000000000000000000000000000') {
      throw new OracleConfigurationError('ZERO_ADDRESS', 'Primary oracle address cannot be zero');
    }
    if (!config.fallbackOracleAddress || config.fallbackOracleAddress === '0x0000000000000000000000000000000000000000') {
      throw new OracleConfigurationError('ZERO_ADDRESS', 'Fallback oracle address cannot be zero');
    }
    if (config.primaryOracleAddress.toLowerCase() === config.fallbackOracleAddress.toLowerCase()) {
      throw new OracleConfigurationError('DUPLICATE_ORACLE', 'Primary and fallback oracles cannot be identical');
    }

    if (config.maxDeviationBps === 0 || config.maxDeviationBps > 5000) {
      throw new OracleConfigurationError(
        'INVALID_DEVIATION_CAP',
        `Max deviation ${config.maxDeviationBps} must be in [1, 5000]`
      );
    }

    if (config.maxPriceAge === 0) {
      throw new OracleConfigurationError('INVALID_MAX_AGE', 'Max price age must be non-zero');
    }

    if (config.primaryPrice <= 0n || config.fallbackPrice <= 0n) {
      throw new OracleConfigurationError('INVALID_PRICE', 'Configured oracle prices must be strictly positive');
    }

    // Verify freshness
    if (config.primaryUpdatedAt > now || now - config.primaryUpdatedAt > config.maxPriceAge) {
      throw new OracleConfigurationError('STALE_PRIMARY_FEED', 'Primary oracle feed is stale or in the future');
    }
    if (config.fallbackUpdatedAt > now || now - config.fallbackUpdatedAt > config.maxPriceAge) {
      throw new OracleConfigurationError('STALE_FALLBACK_FEED', 'Fallback oracle feed is stale or in the future');
    }

    const deviationBps = this.calculateDeviationBps(config.primaryPrice, config.fallbackPrice);
    if (deviationBps > BigInt(config.maxDeviationBps)) {
      throw new OracleConfigurationError(
        'INITIAL_DEVIATION_EXCEEDED',
        `Initial feeds disagree by ${deviationBps} bps, exceeding max allowed ${config.maxDeviationBps} bps`
      );
    }

    const verifiedPrice = config.primaryPrice > config.fallbackPrice ? config.primaryPrice : config.fallbackPrice;
    return { deviationBps, verifiedPrice };
  }
}
