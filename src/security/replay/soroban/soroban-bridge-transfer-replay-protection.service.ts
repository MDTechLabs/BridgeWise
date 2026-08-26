import { StellarReplayProtectionCache } from '../../../cache/replay/stellar/stellar-replay-protection-cache';
import type { ReplayMetadata, ReplayCacheConfig } from '../../../cache/replay/stellar/stellar-replay-protection-cache';

export class SorobanBridgeTransferReplayProtectionService {
  private readonly cache: StellarReplayProtectionCache;

  constructor(config: Partial<ReplayCacheConfig> = {}) {
    this.cache = new StellarReplayProtectionCache(config);
  }

  record(metadata: ReplayMetadata): void {
    this.cache.store(metadata);
  }

  isReplay(transactionHash: string, sourceAccount: string, sequenceNumber: string): boolean {
    return this.cache.isReplay(transactionHash, sourceAccount, sequenceNumber);
  }

  get(transactionHash: string, sourceAccount: string, sequenceNumber: string): ReplayMetadata | null {
    return this.cache.get(transactionHash, sourceAccount, sequenceNumber);
  }

  clear(): void {
    this.cache.clear();
  }

  destroy(): void {
    this.cache.destroy();
  }
}

