/**
 * Exposure Limit Service
 * 
 * Enforces configurable per-transaction, per-asset, and aggregate exposure limits
 * for bridge transfers to prevent protocol insolvency and systemic risk.
 */

export interface ExposureLimitConfig {
  /** Maximum single transfer limit in USD */
  perTransactionLimitUsd: number;
  /** Per-asset 24h cumulative volume limit in USD */
  perAssetDailyLimitUsd: Record<string, number>;
  /** Default 24h limit for unlisted assets in USD */
  defaultPerAssetDailyLimitUsd: number;
  /** Aggregate active in-flight protocol exposure limit in USD */
  aggregateProtocolExposureLimitUsd: number;
}

export interface TransferRequest {
  transferId: string;
  asset: string;
  amountUsd: number;
  sender?: string;
  timestamp?: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  code?: 'EXCEEDS_PER_TX_LIMIT' | 'EXCEEDS_ASSET_DAILY_LIMIT' | 'EXCEEDS_AGGREGATE_EXPOSURE_LIMIT';
  details?: {
    requestedUsd: number;
    limitUsd: number;
    currentExposureUsd?: number;
  };
}

export interface ExposureSummary {
  aggregateActiveExposureUsd: number;
  aggregateLimitUsd: number;
  dailyAssetVolumeUsd: Record<string, number>;
  activeTransfersCount: number;
}

export class ExposureLimitService {
  private config: ExposureLimitConfig;
  private activeTransfers: Map<string, TransferRequest> = new Map();
  private dailyAssetTotals: Map<string, number> = new Map();
  private aggregateActiveUsd = 0;

  constructor(initialConfig?: Partial<ExposureLimitConfig>) {
    this.config = {
      perTransactionLimitUsd: initialConfig?.perTransactionLimitUsd ?? 500000, // $500k default
      perAssetDailyLimitUsd: initialConfig?.perAssetDailyLimitUsd ?? {},
      defaultPerAssetDailyLimitUsd: initialConfig?.defaultPerAssetDailyLimitUsd ?? 2000000, // $2M default
      aggregateProtocolExposureLimitUsd: initialConfig?.aggregateProtocolExposureLimitUsd ?? 10000000, // $10M default
    };
  }

  /**
   * Validate if a proposed transfer satisfies all exposure limit rules without recording it.
   */
  public validateTransfer(transfer: TransferRequest): LimitCheckResult {
    const { asset, amountUsd } = transfer;

    if (amountUsd <= 0) {
      return {
        allowed: false,
        reason: 'Transfer amount must be greater than 0',
      };
    }

    // 1. Per-transaction limit check
    if (amountUsd > this.config.perTransactionLimitUsd) {
      return {
        allowed: false,
        code: 'EXCEEDS_PER_TX_LIMIT',
        reason: `Transfer amount ($${amountUsd}) exceeds maximum per-transaction limit ($${this.config.perTransactionLimitUsd})`,
        details: {
          requestedUsd: amountUsd,
          limitUsd: this.config.perTransactionLimitUsd,
        },
      };
    }

    // 2. Per-asset daily volume limit check
    const currentAssetDailyTotal = this.dailyAssetTotals.get(asset.toUpperCase()) ?? 0;
    const assetLimit = this.config.perAssetDailyLimitUsd[asset.toUpperCase()] ?? this.config.defaultPerAssetDailyLimitUsd;
    
    if (currentAssetDailyTotal + amountUsd > assetLimit) {
      return {
        allowed: false,
        code: 'EXCEEDS_ASSET_DAILY_LIMIT',
        reason: `Transfer of $${amountUsd} for asset ${asset} would exceed daily limit ($${assetLimit}). Current volume: $${currentAssetDailyTotal}`,
        details: {
          requestedUsd: amountUsd,
          limitUsd: assetLimit,
          currentExposureUsd: currentAssetDailyTotal,
        },
      };
    }

    // 3. Aggregate protocol exposure limit check
    if (this.aggregateActiveUsd + amountUsd > this.config.aggregateProtocolExposureLimitUsd) {
      return {
        allowed: false,
        code: 'EXCEEDS_AGGREGATE_EXPOSURE_LIMIT',
        reason: `Transfer of $${amountUsd} would exceed total protocol active exposure limit ($${this.config.aggregateProtocolExposureLimitUsd}). Current active exposure: $${this.aggregateActiveUsd}`,
        details: {
          requestedUsd: amountUsd,
          limitUsd: this.config.aggregateProtocolExposureLimitUsd,
          currentExposureUsd: this.aggregateActiveUsd,
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Validate and record a transfer into active protocol exposure and daily cumulative volume.
   */
  public recordTransfer(transfer: TransferRequest): LimitCheckResult {
    const checkResult = this.validateTransfer(transfer);
    if (!checkResult.allowed) {
      return checkResult;
    }

    const assetKey = transfer.asset.toUpperCase();
    this.activeTransfers.set(transfer.transferId, transfer);
    
    const currentDaily = this.dailyAssetTotals.get(assetKey) ?? 0;
    this.dailyAssetTotals.set(assetKey, currentDaily + transfer.amountUsd);
    
    this.aggregateActiveUsd += transfer.amountUsd;

    return { allowed: true };
  }

  /**
   * Release an active transfer upon successful completion or cancellation, reducing active protocol exposure.
   */
  public releaseTransfer(transferId: string): boolean {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) {
      return false;
    }

    this.activeTransfers.delete(transferId);
    this.aggregateActiveUsd = Math.max(0, this.aggregateActiveUsd - transfer.amountUsd);
    return true;
  }

  /**
   * Set per-transaction maximum limit in USD.
   */
  public setPerTransactionLimit(limitUsd: number): void {
    if (limitUsd < 0) throw new Error('Limit must be non-negative');
    this.config.perTransactionLimitUsd = limitUsd;
  }

  /**
   * Set daily volume limit in USD for a specific asset.
   */
  public setAssetDailyLimit(asset: string, limitUsd: number): void {
    if (limitUsd < 0) throw new Error('Limit must be non-negative');
    this.config.perAssetDailyLimitUsd[asset.toUpperCase()] = limitUsd;
  }

  /**
   * Set total aggregate protocol exposure limit in USD.
   */
  public setAggregateExposureLimit(limitUsd: number): void {
    if (limitUsd < 0) throw new Error('Limit must be non-negative');
    this.config.aggregateProtocolExposureLimitUsd = limitUsd;
  }

  /**
   * Reset daily asset volume counters (e.g. at 00:00 UTC).
   */
  public resetDailyLimits(): void {
    this.dailyAssetTotals.clear();
  }

  /**
   * Get current exposure summary metrics.
   */
  public getCurrentExposure(): ExposureSummary {
    const dailyVolumeRecord: Record<string, number> = {};
    for (const [asset, volume] of this.dailyAssetTotals.entries()) {
      dailyVolumeRecord[asset] = volume;
    }

    return {
      aggregateActiveExposureUsd: this.aggregateActiveUsd,
      aggregateLimitUsd: this.config.aggregateProtocolExposureLimitUsd,
      dailyAssetVolumeUsd: dailyVolumeRecord,
      activeTransfersCount: this.activeTransfers.size,
    };
  }

  /**
   * Get active config.
   */
  public getConfig(): ExposureLimitConfig {
    return {
      ...this.config,
      perAssetDailyLimitUsd: { ...this.config.perAssetDailyLimitUsd },
    };
  }
}
