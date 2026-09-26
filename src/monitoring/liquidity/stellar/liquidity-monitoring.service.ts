/**
 * Stellar Bridge Liquidity Monitoring Service
 *
 * Continuously collects liquidity data from registered providers, detects
 * significant liquidity changes, generates alerts when thresholds are breached,
 * and produces monitoring reports.
 *
 * @see Issue #596 — Implement Stellar Bridge Liquidity Monitoring Service
 */

import { EventEmitter } from 'events';
import type {
  LiquidityAlert,
  LiquidityAlertSeverity,
  LiquidityAlertThreshold,
  LiquidityAssetReport,
  LiquidityChangeDirection,
  LiquidityChangeEvent,
  LiquidityDataCollector,
  LiquidityDataPoint,
  LiquidityMonitoringConfig,
  LiquidityProviderRegistration,
  LiquidityReport,
  LiquiditySummary,
} from './types';

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<LiquidityMonitoringConfig> = {
  collectionIntervalMs: 30_000,
  historySize: 1000,
  changeThresholdPercent: 5,
  alertThresholds: [
    { asset: 'USDC', warningAmount: '50000', criticalAmount: '10000' },
    { asset: 'USDT', warningAmount: '50000', criticalAmount: '10000' },
    { asset: 'XLM', warningAmount: '100000', criticalAmount: '25000' },
    { asset: 'ETH', warningAmount: '50', criticalAmount: '10' },
  ],
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class StellarBridgeLiquidityMonitoringService extends EventEmitter {
  private readonly config: Required<LiquidityMonitoringConfig>;
  private readonly providers = new Map<string, LiquidityProviderRegistration>();
  private readonly history = new Map<string, LiquidityDataPoint[]>();
  private readonly alerts = new Map<string, LiquidityAlert>();
  private readonly previousAmounts = new Map<string, string>();
  private collectionTimer: ReturnType<typeof setInterval> | null = null;
  private monitoringSince = 0;

  constructor(config: LiquidityMonitoringConfig = {}) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      alertThresholds: config.alertThresholds
        ? [...config.alertThresholds]
        : [...DEFAULT_CONFIG.alertThresholds],
    };
  }

  // ─── Provider Registration ─────────────────────────────────────────────────

  /**
   * Register a provider for liquidity monitoring.
   */
  registerProvider(registration: LiquidityProviderRegistration): void {
    this.providers.set(registration.providerId, registration);
  }

  /**
   * Unregister a provider from monitoring.
   */
  unregisterProvider(providerId: string): boolean {
    // Clean up history and previous amounts for this provider
    const keysToDelete: string[] = [];
    for (const key of this.history.keys()) {
      if (key.startsWith(`${providerId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.history.delete(key);
      this.previousAmounts.delete(key);
    }
    return this.providers.delete(providerId);
  }

  /**
   * Get all registered provider IDs.
   */
  getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  // ─── Data Collection ────────────────────────────────────────────────────────

  /**
   * Collect liquidity data from all registered providers for all their assets.
   * Detects changes and evaluates alerts based on the collected data.
   */
  async collectAll(): Promise<LiquidityDataPoint[]> {
    const results: LiquidityDataPoint[] = [];
    const errors: string[] = [];

    for (const [providerId, registration] of this.providers) {
      for (const asset of registration.assets) {
        try {
          const dataPoint = await registration.collector(asset);
          const enriched: LiquidityDataPoint = {
            ...dataPoint,
            providerId,
            timestamp: Date.now(),
          };

          this.recordDataPoint(providerId, asset, enriched);
          this.detectLiquidityChange(providerId, asset, enriched);
          this.evaluateAlert(providerId, asset, enriched);
          results.push(enriched);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`Provider ${providerId} asset ${asset} failed: ${message}`);
          this.emit('error', { providerId, asset, error: message });
        }
      }
    }

    if (errors.length > 0) {
      this.emit('collectionErrors', errors);
    }

    return results;
  }

  /**
   * Collect liquidity data for a specific provider and asset.
   */
  async collect(providerId: string, asset: string): Promise<LiquidityDataPoint | null> {
    const registration = this.providers.get(providerId);
    if (!registration) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    try {
      const dataPoint = await registration.collector(asset);
      const enriched: LiquidityDataPoint = {
        ...dataPoint,
        providerId,
        timestamp: Date.now(),
      };

      this.recordDataPoint(providerId, asset, enriched);
      this.detectLiquidityChange(providerId, asset, enriched);
      this.evaluateAlert(providerId, asset, enriched);
      return enriched;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit('error', { providerId, asset, error: message });
      return null;
    }
  }

  // ─── Change Detection ───────────────────────────────────────────────────────

  /**
   * Get the most recent liquidity change for a provider/asset pair.
   */
  getLatestChange(
    providerId: string,
    asset: string,
  ): LiquidityChangeEvent | undefined {
    const key = `${providerId}:${asset}`;
    const previous = this.previousAmounts.get(key);
    if (previous === undefined) return undefined;

    const history = this.history.get(key);
    if (!history || history.length === 0) return undefined;

    const current = history[history.length - 1];
    const delta = BigInt(current.availableAmount) - BigInt(previous);
    const prevBig = BigInt(previous);

    const direction: LiquidityChangeDirection =
      delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'unchanged';

    const deltaPercent =
      prevBig > 0
        ? parseFloat(
            (
              (Number(delta) / Number(prevBig)) *
              100
            ).toFixed(2),
          )
        : 0;

    return {
      providerId,
      asset,
      previousAmount: previous,
      currentAmount: current.availableAmount,
      deltaAmount: delta.toString(),
      deltaPercent,
      direction,
      timestamp: Date.now(),
    };
  }

  /**
   * Get all detected liquidity changes that exceed the threshold.
   */
  getSignificantChanges(): LiquidityChangeEvent[] {
    const changes: LiquidityChangeEvent[] = [];

    for (const [providerId] of this.providers) {
      for (const asset of this.getTrackedAssets(providerId)) {
        const change = this.getLatestChange(providerId, asset);
        if (
          change &&
          Math.abs(change.deltaPercent) >= this.config.changeThresholdPercent
        ) {
          changes.push(change);
        }
      }
    }

    return changes;
  }

  // ─── Alert Management ───────────────────────────────────────────────────────

  /**
   * Get all active alerts.
   */
  getActiveAlerts(): LiquidityAlert[] {
    return Array.from(this.alerts.values()).filter((a) => a.active);
  }

  /**
   * Get all alerts (including resolved).
   */
  getAllAlerts(): LiquidityAlert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Get alerts filtered by severity.
   */
  getAlertsBySeverity(severity: LiquidityAlertSeverity): LiquidityAlert[] {
    return Array.from(this.alerts.values()).filter(
      (a) => a.active && a.severity === severity,
    );
  }

  /**
   * Manually resolve an alert.
   */
  resolveAlert(alertKey: string): boolean {
    const alert = this.alerts.get(alertKey);
    if (!alert || !alert.active) return false;

    alert.active = false;
    alert.resolvedAt = Date.now();
    this.alerts.set(alertKey, alert);
    this.emit('alertResolved', alert);
    return true;
  }

  // ─── Threshold Management ───────────────────────────────────────────────────

  /**
   * Get all configured alert thresholds.
   */
  getThresholds(): LiquidityAlertThreshold[] {
    return [...this.config.alertThresholds];
  }

  /**
   * Set or update an alert threshold for an asset.
   */
  setThreshold(threshold: LiquidityAlertThreshold): void {
    const idx = this.config.alertThresholds.findIndex(
      (t) => t.asset === threshold.asset,
    );
    if (idx !== -1) {
      this.config.alertThresholds[idx] = threshold;
    } else {
      this.config.alertThresholds.push(threshold);
    }
  }

  /**
   * Remove an alert threshold for an asset.
   */
  removeThreshold(asset: string): boolean {
    const idx = this.config.alertThresholds.findIndex(
      (t) => t.asset === asset,
    );
    if (idx === -1) return false;
    this.config.alertThresholds.splice(idx, 1);
    return true;
  }

  // ─── Reports ────────────────────────────────────────────────────────────────

  /**
   * Generate a liquidity monitoring report for a specified time window.
   *
   * @param windowMs  Time window in ms to analyze (default: 300000 = 5 min).
   */
  generateReport(windowMs: number = 300_000): LiquidityReport {
    const now = Date.now();
    const cutoff = now - windowMs;

    // Collect active assets from the history
    const assetProviders = new Map<
      string,
      { totalAvailable: bigint; utilizationSum: number; count: number; warningCount: number; criticalCount: number; atRisk: string[]; changes: number[] }
    >();

    for (const [key, dataPoints] of this.history) {
      const recent = dataPoints.filter((dp) => dp.timestamp >= cutoff);
      if (recent.length === 0) continue;

      const [, asset] = key.split(':', 2);
      const providerId = key.slice(0, key.indexOf(':'));
      const latest = recent[recent.length - 1];

      if (!assetProviders.has(asset)) {
        assetProviders.set(asset, {
          totalAvailable: 0n,
          utilizationSum: 0,
          count: 0,
          warningCount: 0,
          criticalCount: 0,
          atRisk: [],
          changes: [],
        });
      }

      const entry = assetProviders.get(asset)!;
      entry.totalAvailable += BigInt(latest.availableAmount);
      entry.utilizationSum += latest.utilizationRate;
      entry.count++;

      // Check alert status from thresholds
      const threshold = this.config.alertThresholds.find(
        (t) => t.asset === asset,
      );
      if (threshold) {
        const available = BigInt(latest.availableAmount);
        if (available <= BigInt(threshold.criticalAmount)) {
          entry.criticalCount++;
          entry.atRisk.push(providerId);
        } else if (available <= BigInt(threshold.warningAmount)) {
          entry.warningCount++;
          entry.atRisk.push(providerId);
        }
      }

      // Calculate change for this provider/asset pair
      if (recent.length >= 2) {
        const oldest = recent[0];
        const oldestBig = BigInt(oldest.availableAmount);
        const latestBig = BigInt(latest.availableAmount);
        if (oldestBig > 0n) {
          entry.changes.push(
            parseFloat(
              (
                (Number(latestBig - oldestBig) /
                  Number(oldestBig)) *
                100
              ).toFixed(2),
            ),
          );
        }
      }
    }

    const assetReports: LiquidityAssetReport[] = [];
    for (const [asset, data] of assetProviders) {
      assetReports.push({
        asset,
        providerCount: data.count,
        totalAvailable: data.totalAvailable.toString(),
        avgUtilization:
          data.count > 0 ? data.utilizationSum / data.count : 0,
        warningCount: data.warningCount,
        criticalCount: data.criticalCount,
        atRiskProviders: [...new Set(data.atRisk)],
        avgChangePercent:
          data.changes.length > 0
            ? parseFloat(
                (
                  data.changes.reduce((s, c) => s + c, 0) /
                  data.changes.length
                ).toFixed(2),
              )
            : 0,
      });
    }

    const activeAlerts = this.getActiveAlerts();
    const summary: LiquiditySummary = {
      totalProviders: this.providers.size,
      totalAssets: assetProviders.size,
      activeAlertCount: activeAlerts.length,
      warningAlerts: activeAlerts.filter((a) => a.severity === 'warning')
        .length,
      criticalAlerts: activeAlerts.filter((a) => a.severity === 'critical')
        .length,
      monitoringSince: this.monitoringSince,
    };

    return {
      id: `liquidity-report-${now}`,
      generatedAt: now,
      windowMs,
      assets: assetReports,
      summary,
    };
  }

  // ─── Monitoring Control ─────────────────────────────────────────────────────

  /**
   * Start continuous liquidity monitoring.
   * Idempotent — calling twice has no effect.
   */
  startMonitoring(): void {
    if (this.collectionTimer) return;

    this.monitoringSince = Date.now();
    void this.collectAll();

    this.collectionTimer = setInterval(() => {
      void this.collectAll();
    }, this.config.collectionIntervalMs);

    this.emit('monitoringStarted', { timestamp: this.monitoringSince });
  }

  /**
   * Stop continuous monitoring.
   * Idempotent.
   */
  stopMonitoring(): void {
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = null;
      this.emit('monitoringStopped', { timestamp: Date.now() });
    }
  }

  /**
   * Whether monitoring is currently active.
   */
  get isMonitoring(): boolean {
    return this.collectionTimer !== null;
  }

  // ─── History Access ─────────────────────────────────────────────────────────

  /**
   * Get the liquidity history for a provider/asset pair.
   */
  getHistory(providerId: string, asset: string): LiquidityDataPoint[] {
    const key = `${providerId}:${asset}`;
    return [...(this.history.get(key) ?? [])];
  }

  /**
   * Clear all history and alerts.
   */
  reset(): void {
    this.stopMonitoring();
    this.history.clear();
    this.previousAmounts.clear();
    this.alerts.clear();
    this.providers.clear();
    this.monitoringSince = 0;
    this.removeAllListeners();
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private recordDataPoint(
    providerId: string,
    asset: string,
    dataPoint: LiquidityDataPoint,
  ): void {
    const key = `${providerId}:${asset}`;
    let history = this.history.get(key);
    if (!history) {
      history = [];
      this.history.set(key, history);
    }

    history.push(dataPoint);

    // Prune history to the configured size
    while (history.length > this.config.historySize) {
      history.shift();
    }
  }

  private detectLiquidityChange(
    providerId: string,
    asset: string,
    dataPoint: LiquidityDataPoint,
  ): void {
    const key = `${providerId}:${asset}`;
    const previous = this.previousAmounts.get(key);

    if (previous === undefined) {
      this.previousAmounts.set(key, dataPoint.availableAmount);
      return;
    }

    const delta = BigInt(dataPoint.availableAmount) - BigInt(previous);
    const prevBig = BigInt(previous);
    const deltaPercent =
      prevBig > 0
        ? parseFloat(
            (
              (Number(delta) / Number(prevBig)) *
              100
            ).toFixed(2),
          )
        : 0;

    // Only emit change event if it exceeds the threshold
    if (Math.abs(deltaPercent) >= this.config.changeThresholdPercent) {
      const direction: LiquidityChangeDirection =
        delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'unchanged';

      const event: LiquidityChangeEvent = {
        providerId,
        asset,
        previousAmount: previous,
        currentAmount: dataPoint.availableAmount,
        deltaAmount: delta.toString(),
        deltaPercent,
        direction,
        timestamp: Date.now(),
      };

      this.emit('liquidityChange', event);

      if (direction === 'decrease') {
        this.emit('liquidityDecrease', event);
      } else if (direction === 'increase') {
        this.emit('liquidityIncrease', event);
      }
    }

    this.previousAmounts.set(key, dataPoint.availableAmount);
  }

  private evaluateAlert(
    providerId: string,
    asset: string,
    dataPoint: LiquidityDataPoint,
  ): void {
    const threshold = this.config.alertThresholds.find(
      (t) => t.asset === asset,
    );
    if (!threshold) return;

    const available = BigInt(dataPoint.availableAmount);
    const warningThreshold = BigInt(threshold.warningAmount);
    const criticalThreshold = BigInt(threshold.criticalAmount);

    const alertKey = `${providerId}:${asset}`;
    const existingAlert = this.alerts.get(alertKey);

    if (available <= criticalThreshold) {
      // Critical alert
      if (!existingAlert || !existingAlert.active || existingAlert.severity !== 'critical') {
        const alert: LiquidityAlert = {
          providerId,
          asset,
          availableAmount: dataPoint.availableAmount,
          threshold: threshold.criticalAmount,
          severity: 'critical',
          timestamp: Date.now(),
          active: true,
        };
        this.alerts.set(alertKey, alert);
        this.emit('criticalAlert', alert);
        this.emit('alert', alert);
      }
    } else if (available <= warningThreshold) {
      // Warning alert
      if (!existingAlert || !existingAlert.active || existingAlert.severity !== 'warning') {
        const alert: LiquidityAlert = {
          providerId,
          asset,
          availableAmount: dataPoint.availableAmount,
          threshold: threshold.warningAmount,
          severity: 'warning',
          timestamp: Date.now(),
          active: true,
        };
        this.alerts.set(alertKey, alert);
        this.emit('warningAlert', alert);
        this.emit('alert', alert);
      }
    } else if (existingAlert && existingAlert.active) {
      // Liquidity recovered — resolve alert
      existingAlert.active = false;
      existingAlert.resolvedAt = Date.now();
      this.alerts.set(alertKey, existingAlert);
      this.emit('alertResolved', existingAlert);
    }
  }

  private getTrackedAssets(providerId: string): string[] {
    const registration = this.providers.get(providerId);
    return registration?.assets ?? [];
  }
}
