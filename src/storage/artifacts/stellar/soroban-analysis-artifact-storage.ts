/**
 * Soroban Analysis Artifact Storage
 *
 * Stores analysis artifacts generated from Soroban contract analysis,
 * such as ABI interpretations, security analysis results, optimization
 * suggestions, and other analytical outputs.
 */

export interface SorobanAnalysisArtifact {
  id: string;
  contractId: string;
  artifactType: SorobanAnalysisArtifactType;
  title: string;
  description?: string;
  content: unknown; // JSON-serializable analysis result
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  version: number;
  tags: string[];
}

export type SorobanAnalysisArtifactType =
  | 'abi_interpretation'
  | 'security_analysis'
  | 'gas_optimization'
  | 'storage_layout'
  | 'inheritance_graph'
  | 'function_summary'
  | 'event_summary'
  | 'access_control_analysis'
  | 'reentrancy_analysis'
  | 'formal_verification'
  | 'test_coverage'
  | 'gas_report'
  | 'compile_info'
  | 'dependency_graph'
  | 'license_analysis'
  | 'custom';

export interface SorobanAnalysisArtifactFilter {
  id?: string;
  contractId?: string;
  artifactType?: SorobanAnalysisArtifactType;
  title?: string;
  tags?: string[];
  minCreatedAt?: number;
  maxCreatedAt?: number;
  minUpdatedAt?: number;
  maxUpdatedAt?: number;
  version?: number;
  contentContains?: Record<string, unknown>;
  metadataContains?: Record<string, unknown>;
}

export interface SorobanAnalysisArtifactQueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'version';
  order?: 'asc' | 'desc';
}

export interface SorobanAnalysisArtifactQueryResult {
  total: number;
  items: SorobanAnalysisArtifact[];
}

export interface SorobanAnalysisArtifactStorageConfig {
  /** Maximum number of artifacts to store per contract */
  maxArtifactsPerContract?: number;
  /** Enable automatic cleanup of old artifacts */
  cleanupEnabled?: boolean;
  /** Maximum age of artifacts to retain (ms) */
  maxArtifactAgeMs?: number;
  /** Background cleanup interval (ms) */
  cleanupIntervalMs?: number;
}

const DEFAULT_CONFIG: Required<SorobanAnalysisArtifactStorageConfig> = {
  maxArtifactsPerContract: 100,
  cleanupEnabled: true,
  maxArtifactAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
};

export class SorobanAnalysisArtifactStorage {
  private readonly artifacts = new Map<string, Map<string, SorobanAnalysisArtifact>>(); // contractId -> artifactId -> artifact
  private readonly config: Required<SorobanAnalysisArtifactStorageConfig>;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config: SorobanAnalysisArtifactStorageConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.cleanupEnabled) {
      this.startCleanup();
    }
  }

  /**
   * Store an analysis artifact.
   * If an artifact with the same ID exists, it will be updated.
   */
  storeArtifact(
    artifact: Omit<SorobanAnalysisArtifact, 'createdAt' | 'updatedAt'> & {
      createdAt?: number;
      updatedAt?: number;
    },
  ): SorobanAnalysisArtifact {
    const now = Date.now();
    const storedArtifact: SorobanAnalysisArtifact = {
      ...artifact,
      createdAt: artifact.createdAt ?? now,
      updatedAt: artifact.updatedAt ?? now,
      content: artifact.content ?? {},
      metadata: artifact.metadata ?? {},
      tags: artifact.tags ?? [],
      version: artifact.version ?? 1,
    };

    // Get or create the contract's artifact map
    let contractArtifacts = this.artifacts.get(artifact.contractId);
    if (!contractArtifacts) {
      contractArtifacts = new Map<string, SorobanAnalysisArtifact>();
      this.artifacts.set(artifact.contractId, contractArtifacts);
    }

    // Check if we need to enforce the limit
    const isUpdate = contractArtifacts.has(artifact.id);
    if (!isUpdate && this.config.maxArtifactsPerContract > 0) {
      this.enforceLimitPerContract(artifact.contractId);
    }

    // Store/update the artifact
    contractArtifacts.set(artifact.id, storedArtifact);
    return storedArtifact;
  }

  /**
   * Batch store multiple artifacts.
   */
  batchStoreArtifacts(
    artifacts: Array<
      Omit<SorobanAnalysisArtifact, 'createdAt' | 'updatedAt'> & {
        createdAt?: number;
        updatedAt?: number;
      }
    >,
  ): SorobanAnalysisArtifact[] {
    return artifacts.map((artifact) => this.storeArtifact(artifact));
  }

  /**
   * Retrieve an artifact by its ID and contract ID.
   */
  getArtifact(contractId: string, artifactId: string): SorobanAnalysisArtifact | null {
    const contractArtifacts = this.artifacts.get(contractId);
    if (!contractArtifacts) return null;
    return contractArtifacts.get(artifactId) ?? null;
  }

  /**
   * Check if an artifact exists.
   */
  hasArtifact(contractId: string, artifactId: string): boolean {
    const contractArtifacts = this.artifacts.get(contractId);
    if (!contractArtifacts) return false;
    return contractArtifacts.has(artifactId);
  }

  /**
   * Remove an artifact by ID and contract ID.
   */
  removeArtifact(contractId: string, artifactId: string): boolean {
    const contractArtifacts = this.artifacts.get(contractId);
    if (!contractArtifacts) return false;
    const removed = contractArtifacts.delete(artifactId);
    if (contractArtifacts.size === 0) {
      this.artifacts.delete(contractId);
    }
    return removed;
  }

  /**
   * Remove all artifacts for a specific contract.
   */
  removeArtifactsByContract(contractId: string): number {
    const contractArtifacts = this.artifacts.get(contractId);
    if (!contractArtifacts) return 0;
    const count = contractArtifacts.size;
    contractArtifacts.clear();
    this.artifacts.delete(contractId);
    return count;
  }

  /**
   * Remove all artifacts matching a filter.
   */
  removeArtifactsByFilter(filter: SorobanAnalysisArtifactFilter): number {
    let removed = 0;
    for (const [contractId, contractArtifacts] of this.artifacts) {
      const toRemove: string[] = [];
      for (const [artifactId, artifact] of contractArtifacts) {
        if (this.matchesFilter(artifact, filter)) {
          toRemove.push(artifactId);
        }
      }
      for (const artifactId of toRemove) {
        contractArtifacts.delete(artifactId);
        removed++;
      }
      if (contractArtifacts.size === 0) {
        this.artifacts.delete(contractId);
      }
    }
    return removed;
  }

  /**
   * Get all artifacts for a specific contract.
   */
  getArtifactsByContract(contractId: string): SorobanAnalysisArtifact[] {
    const contractArtifacts = this.artifacts.get(contractId);
    if (!contractArtifacts) return [];
    return Array.from(contractArtifacts.values());
  }

  /**
   * Get artifacts by type.
   */
  getArtifactsByType(artifactType: SorobanAnalysisArtifactType): SorobanAnalysisArtifact[] {
    const result: SorobanAnalysisArtifact[] = [];
    for (const [, contractArtifacts] of this.artifacts) {
      for (const artifact of contractArtifacts.values()) {
        if (artifact.artifactType === artifactType) {
          result.push(artifact);
        }
      }
    }
    return result;
  }

  /**
   * Get artifacts by tag.
   */
  getArtifactsByTag(tag: string): SorobanAnalysisArtifact[] {
    const result: SorobanAnalysisArtifact[] = [];
    for (const [, contractArtifacts] of this.artifacts) {
      for (const artifact of contractArtifacts.values()) {
        if (artifact.tags.includes(tag)) {
          result.push(artifact);
        }
      }
    }
    return result;
  }

  /**
   * Clear all stored artifacts.
   */
  clear(): void {
    this.artifacts.clear();
  }

  /**
   * Get total count of stored artifacts.
   */
  get size(): number {
    let count = 0;
    for (const [, contractArtifacts] of this.artifacts) {
      count += contractArtifacts.size;
    }
    return count;
  }

  /**
   * Query artifacts with filtering and pagination.
   */
  queryArtifacts(
    filter: SorobanAnalysisArtifactFilter = {},
    options: SorobanAnalysisArtifactQueryOptions = {},
  ): SorobanAnalysisArtifactQueryResult {
    // Collect all artifacts
    const allArtifacts: SorobanAnalysisArtifact[] = [];
    for (const [, contractArtifacts] of this.artifacts) {
      for (const artifact of contractArtifacts.values()) {
        allArtifacts.push(artifact);
      }
    }

    // Apply filters
    const filtered = allArtifacts.filter((artifact) =>
      this.matchesFilter(artifact, filter),
    );

    // Apply sorting
    const sorted = filtered.slice().sort((a, b) => {
      const order = options.order === 'asc' ? 1 : -1;
      const sortBy = options.sortBy ?? 'createdAt';
      return order * (a[sortBy as keyof SorobanAnalysisArtifact] - b[sortBy as keyof SorobanAnalysisArtifact]);
    });

    // Apply pagination
    const offset = Math.max(0, options.offset ?? 0);
    const limit = options.limit != null ? Math.max(0, options.limit) : sorted.length;
    const items = sorted.slice(offset, offset + limit);

    return {
      total: filtered.length,
      items,
    };
  }

  /**
   * Get storage statistics.
   */
  getStats(): SorobanAnalysisArtifactStorageStats {
    let total = 0;
    const byType: Record<SorobanAnalysisArtifactType, number> = {} as Record<
      SorobanAnalysisArtifactType,
      number
    >;
    const byContract: Record<string, number> = {};

    for (const [contractId, contractArtifacts] of this.artifacts) {
      byContract[contractId] = contractArtifacts.size;
      total += contractArtifacts.size;
      for (const artifact of contractArtifacts.values()) {
        byType[artifact.artifactType] =
          (byType[artifact.artifactType] || 0) + 1;
      }
    }

    return {
      total,
      byType,
      byContract,
      config: this.config,
    };
  }

  /**
   * Stop the background cleanup timer.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private matchesFilter(
    artifact: SorobanAnalysisArtifact,
    filter: SorobanAnalysisArtifactFilter,
  ): boolean {
    if (filter.id && artifact.id !== filter.id) {
      return false;
    }
    if (filter.contractId && artifact.contractId !== filter.contractId) {
      return false;
    }
    if (filter.artifactType && artifact.artifactType !== filter.artifactType) {
      return false;
    }
    if (filter.title && !artifact.title.includes(filter.title)) {
      return false;
    }
    if (filter.tags && !filter.tags.some((tag) => artifact.tags.includes(tag))) {
      return false;
    }
    if (filter.minCreatedAt != null && artifact.createdAt < filter.minCreatedAt) {
      return false;
    }
    if (filter.maxCreatedAt != null && artifact.createdAt > filter.maxCreatedAt) {
      return false;
    }
    if (filter.minUpdatedAt != null && artifact.updatedAt < filter.minUpdatedAt) {
      return false;
    }
    if (filter.maxUpdatedAt != null && artifact.updatedAt > filter.maxUpdatedAt) {
      return false;
    }
    if (filter.version != null && artifact.version !== filter.version) {
      return false;
    }
    if (filter.contentContains && !this.matchesContent(artifact.content, filter.contentContains)) {
      return false;
    }
    if (filter.metadataContains && !this.matchesMetadata(artifact.metadata, filter.metadataContains)) {
      return false;
    }
    return true;
  }

  private matchesContent(content: unknown, filter: Record<string, unknown>): boolean {
    if (typeof content !== 'object' || content === null || Array.isArray(content)) {
      return false;
    }
    return Object.entries(filter).every(([key, value]) => {
      // Simple equality check for primitive values
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return (content as Record<string, unknown>)[key] === value;
      }
      // For objects/arrays, we'd need deep equality, but for simplicity we'll do a basic check
      return true;
    });
  }

  private matchesMetadata(
    metadata: Record<string, unknown>,
    filter: Record<string, unknown>,
  ): boolean {
    return Object.entries(filter).every(([key, value]) => {
      if (!(key in metadata)) {
        return false;
      }
      // Simple equality check
      return metadata[key] === value;
    });
  }

  private enforceLimitPerContract(contractId: string): void {
    const contractArtifacts = this.artifacts.get(contractId);
    if (!contractArtifacts) return;

    // Convert to array and sort by updatedAt (oldest first)
    const artifactsArray = Array.from(contractArtifacts.values()).sort(
      (a, b) => a.updatedAt - b.updatedAt,
    );

    // Remove oldest artifacts if we exceed the limit
    while (
      contractArtifacts.size >= this.config.maxArtifactsPerContract &&
      artifactsArray.length > 0
    ) {
      const oldest = artifactsArray.shift();
      if (oldest) {
        contractArtifacts.delete(oldest.id);
      }
    }
  }

  private startCleanup(): void {
    if (!this.config.cleanupEnabled) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
    if (typeof (this.cleanupTimer as { unref?: () => void }).unref === 'function') {
      (this.cleanupTimer as { unref: () => void }).unref();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [contractId, contractArtifacts] of this.artifacts) {
      const toRemove: string[] = [];
      for (const [artifactId, artifact] of contractArtifacts) {
        if (now - artifact.updatedAt > this.config.maxArtifactAgeMs) {
          toRemove.push(artifactId);
        }
      }
      for (const artifactId of toRemove) {
        contractArtifacts.delete(artifactId);
      }
      if (contractArtifacts.size === 0) {
        this.artifacts.delete(contractId);
      }
    }
  }
}

export interface SorobanAnalysisArtifactStorageStats {
  total: number;
  byType: Record<SorobanAnalysisArtifactType, number>;
  byContract: Record<string, number>;
  config: Required<SorobanAnalysisArtifactStorageConfig>;
}

export const sorobanAnalysisArtifactStorage = new SorobanAnalysisArtifactStorage();