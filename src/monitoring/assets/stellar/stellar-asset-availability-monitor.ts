import { EventEmitter } from 'events';
import type {
  StellarProviderMetadata,
} from '../../../providers/discovery/stellar/stellar-provider-discovery.types';

export type AssetAvailabilityStatus = 'available' | 'removed';

export interface AssetAvailabilityState {
  asset: string;
  status: AssetAvailabilityStatus;
  supportedBy: string[];
  providerCount: number;
  lastUpdated: Date;
}

export interface AssetAvailabilityEvent {
  asset: string;
  previousStatus: AssetAvailabilityStatus;
  currentStatus: AssetAvailabilityStatus;
  supportedBy: string[];
  providerCount: number;
  timestamp: number;
}

export interface StellarAssetAvailabilityMonitorConfig {
  /** Discovery source that exposes provider metadata. */
  discovery: {
    getAll(): StellarProviderMetadata[];
  };
  /** Polling interval for provider asset reconciliation. */
  checkIntervalMs?: number;
  /** Provider statuses to include when building the supported asset set. Default: ['active']. */
  providerStatusFilter?: StellarProviderMetadata['status'][];
}

interface InternalAssetAvailabilityState {
  asset: string;
  status: AssetAvailabilityStatus;
  supportedBy: Set<string>;
  providerCount: number;
  lastUpdated: Date;
}

const DEFAULT_CONFIG: Required<Pick<StellarAssetAvailabilityMonitorConfig, 'checkIntervalMs' | 'providerStatusFilter'>> = {
  checkIntervalMs: 30_000,
  providerStatusFilter: ['active'],
};

export class StellarAssetAvailabilityMonitor extends EventEmitter {
  private readonly config: Required<StellarAssetAvailabilityMonitorConfig>;
  private readonly assetStates = new Map<string, InternalAssetAvailabilityState>();
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: StellarAssetAvailabilityMonitorConfig) {
    super();
    if (!config?.discovery || typeof config.discovery.getAll !== 'function') {
      throw new TypeError('StellarAssetAvailabilityMonitor requires a discovery source.');
    }

    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? DEFAULT_CONFIG.checkIntervalMs,
      providerStatusFilter:
        config.providerStatusFilter ?? DEFAULT_CONFIG.providerStatusFilter,
      discovery: config.discovery,
    };

    if (this.config.checkIntervalMs < 1_000) {
      throw new RangeError('checkIntervalMs must be ≥ 1 000 ms');
    }
  }

  startMonitoring(): void {
    if (this.checkInterval) return;

    void this.checkAll();

    this.checkInterval = setInterval(
      () => void this.checkAll(),
      this.config.checkIntervalMs,
    );

    this.checkInterval.unref?.();
  }

  stopMonitoring(): void {
    if (!this.checkInterval) return;
    clearInterval(this.checkInterval);
    this.checkInterval = null;
  }

  reset(): void {
    this.stopMonitoring();
    this.assetStates.clear();
  }

  getAssetState(asset: string): AssetAvailabilityState | null {
    const state = this.assetStates.get(asset);
    if (!state) return null;
    return {
      asset: state.asset,
      status: state.status,
      supportedBy: [...state.supportedBy].sort(),
      providerCount: state.providerCount,
      lastUpdated: new Date(state.lastUpdated),
    };
  }

  getSupportedAssets(): string[] {
    return Array.from(this.assetStates.values())
      .filter((state) => state.status === 'available')
      .map((state) => state.asset)
      .sort();
  }

  getRemovedAssets(): string[] {
    return Array.from(this.assetStates.values())
      .filter((state) => state.status === 'removed')
      .map((state) => state.asset)
      .sort();
  }

  getAllAssets(): AssetAvailabilityState[] {
    return Array.from(this.assetStates.values()).map((state) => ({
      asset: state.asset,
      status: state.status,
      supportedBy: [...state.supportedBy].sort(),
      providerCount: state.providerCount,
      lastUpdated: new Date(state.lastUpdated),
    }));
  }

  async checkAll(): Promise<AssetAvailabilityState[]> {
    const providers = this.getFilteredProviders();
    const currentAssets = new Map<string, Set<string>>();

    for (const provider of providers) {
      const supportedAssets = provider.supportedAssets ?? [];
      for (const asset of supportedAssets) {
        if (!asset) continue;
        const providersForAsset = currentAssets.get(asset) ?? new Set<string>();
        providersForAsset.add(provider.id);
        currentAssets.set(asset, providersForAsset);
      }
    }

    const updatedAssets = new Set<string>();

    for (const [asset, providerIds] of currentAssets.entries()) {
      updatedAssets.add(asset);
      const previousState = this.assetStates.get(asset);
      const currentState: InternalAssetAvailabilityState = {
        asset,
        status: 'available',
        supportedBy: new Set(providerIds),
        providerCount: providerIds.size,
        lastUpdated: new Date(),
      };

      if (
        !previousState ||
        previousState.status === 'removed' ||
        !this.areProviderSetsEqual(previousState.supportedBy, providerIds)
      ) {
        this.assetStates.set(asset, currentState);
        this.emitStatusChange(asset, previousState, currentState);
      } else {
        this.assetStates.set(asset, currentState);
      }
    }

    for (const [asset, previousState] of this.assetStates.entries()) {
      if (updatedAssets.has(asset)) continue;
      if (previousState.status === 'removed') continue;

      const removedState: InternalAssetAvailabilityState = {
        asset,
        status: 'removed',
        supportedBy: new Set<string>(),
        providerCount: 0,
        lastUpdated: new Date(),
      };

      this.assetStates.set(asset, removedState);
      this.emitStatusChange(asset, previousState, removedState);
    }

    return this.getAllAssets();
  }

  private getFilteredProviders(): StellarProviderMetadata[] {
    const allProviders = this.config.discovery.getAll();
    if (!this.config.providerStatusFilter.length) {
      return allProviders;
    }

    const filterSet = new Set(this.config.providerStatusFilter);
    return allProviders.filter((provider) => filterSet.has(provider.status));
  }

  private emitStatusChange(
    asset: string,
    previousState: InternalAssetAvailabilityState | undefined,
    currentState: InternalAssetAvailabilityState,
  ): void {
    const event = {
      asset,
      previousStatus: previousState?.status ?? 'removed',
      currentStatus: currentState.status,
      supportedBy: [...currentState.supportedBy].sort(),
      providerCount: currentState.providerCount,
      timestamp: Date.now(),
    } as AssetAvailabilityEvent;

    this.emit('status-change', event);

    if (currentState.status === 'removed') {
      this.emit('removed', event);
      this.emit('alert', event);
      return;
    }

    if (!previousState || previousState.status === 'removed') {
      this.emit('available', event);
    }
  }

  private areProviderSetsEqual(
    a: Set<string>,
    b: Set<string>,
  ): boolean {
    if (a.size !== b.size) return false;
    for (const value of a) {
      if (!b.has(value)) return false;
    }
    return true;
  }
}
