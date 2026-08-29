import { Injectable, Logger } from '@nestjs/common';

/** Estimated resource usage for a Soroban transaction. */
export interface SorobanResourceUsage {
  cpuInstructions: number;
  readBytes: number;
  writeBytes: number;
  readEntries: number;
  writeEntries: number;
  transactionSizeBytes: number;
}

/** Per-unit resource fee rates (in stroops). Sensible testnet-like defaults. */
export interface SorobanResourceRates {
  perCpuInstruction: number;
  perReadByte: number;
  perWriteByte: number;
  perReadEntry: number;
  perWriteEntry: number;
  perTxByte: number;
}

export interface FeeEstimationConfig {
  /** Multiplier applied to the raw estimate as a safety buffer (e.g. 1.2 = +20%). */
  feeBuffer?: number;
  /** Base network inclusion fee in stroops. */
  baseInclusionFee?: number;
  rates?: Partial<SorobanResourceRates>;
}

export interface SorobanFeeEstimate {
  resourceFee: number;
  inclusionFee: number;
  /** resourceFee + inclusionFee before the buffer. */
  rawFee: number;
  /** Final recommended fee including the buffer. */
  totalFee: number;
  feeBuffer: number;
}

export class FeeEstimationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeeEstimationError';
  }
}

const DEFAULT_RATES: SorobanResourceRates = {
  perCpuInstruction: 0.0025,
  perReadByte: 0.005,
  perWriteByte: 0.02,
  perReadEntry: 6250,
  perWriteEntry: 10000,
  perTxByte: 0.01,
};

/**
 * Estimates the fee required for a Soroban bridge transaction from its resource
 * usage, applying a configurable safety buffer and returning structured fee data
 * that can be attached to route/quote responses.
 */
@Injectable()
export class SorobanFeeEstimatorService {
  private readonly logger = new Logger(SorobanFeeEstimatorService.name);

  private readonly defaultBuffer: number;
  private readonly baseInclusionFee: number;
  private readonly rates: SorobanResourceRates;

  constructor(config: FeeEstimationConfig = {}) {
    this.defaultBuffer = config.feeBuffer ?? 1.15;
    this.baseInclusionFee = config.baseInclusionFee ?? 100;
    this.rates = { ...DEFAULT_RATES, ...(config.rates ?? {}) };
  }

  estimate(usage: SorobanResourceUsage, overrides: FeeEstimationConfig = {}): SorobanFeeEstimate {
    this.assertValidUsage(usage);

    const buffer = overrides.feeBuffer ?? this.defaultBuffer;
    if (buffer < 1) {
      throw new FeeEstimationError('feeBuffer must be >= 1.');
    }
    const inclusionFee = overrides.baseInclusionFee ?? this.baseInclusionFee;
    const rates = { ...this.rates, ...(overrides.rates ?? {}) };

    const resourceFee = Math.ceil(
      usage.cpuInstructions * rates.perCpuInstruction +
        usage.readBytes * rates.perReadByte +
        usage.writeBytes * rates.perWriteByte +
        usage.readEntries * rates.perReadEntry +
        usage.writeEntries * rates.perWriteEntry +
        usage.transactionSizeBytes * rates.perTxByte,
    );

    const rawFee = resourceFee + inclusionFee;
    const totalFee = Math.ceil(rawFee * buffer);

    return { resourceFee, inclusionFee, rawFee, totalFee, feeBuffer: buffer };
  }

  private assertValidUsage(usage: SorobanResourceUsage): void {
    const fields: (keyof SorobanResourceUsage)[] = [
      'cpuInstructions',
      'readBytes',
      'writeBytes',
      'readEntries',
      'writeEntries',
      'transactionSizeBytes',
    ];
    for (const field of fields) {
      const value = usage?.[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new FeeEstimationError(`Invalid resource usage: ${field} must be a non-negative number.`);
      }
    }
  }
}
