import { randomUUID } from 'crypto';
import {
  RouteRecommendationAuditLog,
  AuditSearchQuery,
  AuditSearchResult,
  AuditAPIConfig,
} from './audit.types';

/**
 * Service for storing and retrieving Stellar route recommendation audit logs.
 *
 * The current implementation uses in-memory storage and secondary indexes.
 * The storage abstraction can be replaced with a persistent backend later
 * without changing the public API.
 */
export class StellarRouteAuditAPI {
  private readonly config: AuditAPIConfig;

  private readonly auditLogs = new Map<
    string,
    RouteRecommendationAuditLog
  >();

  private readonly indexByRecommendationId = new Map<string, string[]>();

  private readonly indexByAsset = new Map<string, string[]>();

  constructor(config: Partial<AuditAPIConfig> = {}) {
    const maxSearchResults = config.maxSearchResults ?? 10_000;

    if (!Number.isInteger(maxSearchResults) || maxSearchResults <= 0) {
      throw new Error('maxSearchResults must be a positive integer');
    }

    this.config = {
      storageBackend: config.storageBackend ?? 'memory',
      maxSearchResults,
    };
  }

  /**
   * Log a route recommendation action to the audit trail.
   */
  logRecommendationAction(
    log: Omit<RouteRecommendationAuditLog, 'auditId' | 'timestamp'>,
  ): RouteRecommendationAuditLog {
    this.validateAuditLog(log);

    const auditLog: RouteRecommendationAuditLog = {
      ...log,
      auditId: randomUUID(),
      timestamp: Date.now(),
    };

    this.auditLogs.set(auditLog.auditId, auditLog);
    this.updateIndexes(auditLog);

    return auditLog;
  }

  /**
   * Search audit logs with flexible query parameters.
   */
  async search(query: AuditSearchQuery = {}): Promise<AuditSearchResult> {
    const normalizedQuery = this.normalizeQuery(query);

    let logs = Array.from(this.auditLogs.values());

    /*
     * Use the recommendation index when possible.
     * This avoids scanning the entire audit store for the most common
     * recommendation-history query.
     */
    if (normalizedQuery.recommendationIds?.length) {
      logs = this.getLogsByRecommendationIds(
        normalizedQuery.recommendationIds,
      );
    } else if (normalizedQuery.fromAsset || normalizedQuery.toAsset) {
      /*
       * Asset indexes provide a smaller candidate set before applying
       * the remaining filters.
       */
      const asset = normalizedQuery.fromAsset ?? normalizedQuery.toAsset;

      if (asset) {
        logs = this.getLogsByAsset(asset);
      }
    }

    logs = this.applyFilters(logs, normalizedQuery);

    /*
     * Always return newest events first.
     */
    logs.sort((a, b) => {
      if (b.timestamp !== a.timestamp) {
        return b.timestamp - a.timestamp;
      }

      /*
       * UUIDs are not chronological, but this provides deterministic
       * ordering when two logs have the exact same timestamp.
       */
      return b.auditId.localeCompare(a.auditId);
    });

    const offset = this.normalizeOffset(normalizedQuery.offset);
    const limit = this.normalizeLimit(normalizedQuery.limit);

    return {
      total: logs.length,
      offset,
      limit,
      items: logs.slice(offset, offset + limit),
    };
  }

  /**
   * Get all audit logs for a specific recommendation.
   *
   * Unlike search(), this method intentionally does not allow
   * maxSearchResults to truncate the recommendation history.
   */
  async getRecommendationHistory(
    recommendationId: string,
  ): Promise<RouteRecommendationAuditLog[]> {
    const normalizedId = recommendationId.trim();

    if (!normalizedId) {
      return [];
    }

    const auditIds =
      this.indexByRecommendationId.get(normalizedId) ?? [];

    const history = auditIds
      .map((auditId) => this.auditLogs.get(auditId))
      .filter(
        (log): log is RouteRecommendationAuditLog => log !== undefined,
      );

    return history.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }

      return a.auditId.localeCompare(b.auditId);
    });
  }

  /**
   * Get a specific audit log by ID.
   */
  getAuditLog(auditId: string): RouteRecommendationAuditLog | undefined {
    if (!auditId?.trim()) {
      return undefined;
    }

    return this.auditLogs.get(auditId);
  }

  /**
   * Get the number of stored audit logs.
   */
  getAuditLogCount(): number {
    return this.auditLogs.size;
  }

  /**
   * Clear all in-memory audit logs and indexes.
   *
   * Useful for tests and controlled application shutdown/reset scenarios.
   */
  clear(): void {
    this.auditLogs.clear();
    this.indexByRecommendationId.clear();
    this.indexByAsset.clear();
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private applyFilters(
    logs: RouteRecommendationAuditLog[],
    query: AuditSearchQuery,
  ): RouteRecommendationAuditLog[] {
    const recommendationIds = query.recommendationIds?.length
      ? new Set(query.recommendationIds)
      : undefined;

    const actions = query.actions?.length
      ? new Set(query.actions)
      : undefined;

    const statuses = query.status?.length
      ? new Set(query.status)
      : undefined;

    const fromAsset = this.normalizeAsset(query.fromAsset);
    const toAsset = this.normalizeAsset(query.toAsset);
    const sender = query.sender?.trim();

    return logs.filter((log) => {
      if (
        recommendationIds &&
        !recommendationIds.has(log.recommendationId)
      ) {
        return false;
      }

      if (actions && !actions.has(log.action)) {
        return false;
      }

      if (
        fromAsset &&
        this.normalizeAsset(log.fromAsset) !== fromAsset
      ) {
        return false;
      }

      if (
        toAsset &&
        this.normalizeAsset(log.toAsset) !== toAsset
      ) {
        return false;
      }

      if (sender && log.sender !== sender) {
        return false;
      }

      if (statuses && !statuses.has(log.status)) {
        return false;
      }

      if (
        query.startTime !== undefined &&
        log.timestamp < query.startTime
      ) {
        return false;
      }

      if (
        query.endTime !== undefined &&
        log.timestamp > query.endTime
      ) {
        return false;
      }

      return true;
    });
  }

  private getLogsByRecommendationIds(
    recommendationIds: string[],
  ): RouteRecommendationAuditLog[] {
    const auditIds = new Set<string>();

    for (const recommendationId of recommendationIds) {
      const ids = this.indexByRecommendationId.get(recommendationId) ?? [];

      for (const auditId of ids) {
        auditIds.add(auditId);
      }
    }

    return this.getLogsByIds(auditIds);
  }

  private getLogsByAsset(
    asset: string,
  ): RouteRecommendationAuditLog[] {
    const auditIds = new Set(
      this.indexByAsset.get(this.normalizeAsset(asset)) ?? [],
    );

    return this.getLogsByIds(auditIds);
  }

  private getLogsByIds(
    auditIds: Set<string>,
  ): RouteRecommendationAuditLog[] {
    const logs: RouteRecommendationAuditLog[] = [];

    for (const auditId of auditIds) {
      const log = this.auditLogs.get(auditId);

      if (log) {
        logs.push(log);
      }
    }

    return logs;
  }

  private updateIndexes(log: RouteRecommendationAuditLog): void {
    this.addToIndex(
      this.indexByRecommendationId,
      log.recommendationId,
      log.auditId,
    );

    this.addToIndex(
      this.indexByAsset,
      this.normalizeAsset(log.fromAsset),
      log.auditId,
    );

    this.addToIndex(
      this.indexByAsset,
      this.normalizeAsset(log.toAsset),
      log.auditId,
    );
  }

  private addToIndex(
    index: Map<string, string[]>,
    key: string,
    auditId: string,
  ): void {
    const existing = index.get(key);

    if (existing) {
      existing.push(auditId);
      return;
    }

    index.set(key, [auditId]);
  }

  private validateAuditLog(
    log: Omit<RouteRecommendationAuditLog, 'auditId' | 'timestamp'>,
  ): void {
    if (!log.recommendationId?.trim()) {
      throw new Error('recommendationId is required');
    }

    if (!log.actor?.trim()) {
      throw new Error('actor is required');
    }

    if (!log.fromAsset?.trim()) {
      throw new Error('fromAsset is required');
    }

    if (!log.toAsset?.trim()) {
      throw new Error('toAsset is required');
    }

    if (!log.amount?.trim()) {
      throw new Error('amount is required');
    }

    if (!log.action) {
      throw new Error('action is required');
    }

    if (!log.status) {
      throw new Error('status is required');
    }
  }

  private normalizeQuery(query: AuditSearchQuery): AuditSearchQuery {
    return {
      ...query,
      recommendationIds: query.recommendationIds
        ?.map((id) => id.trim())
        .filter(Boolean),
      sender: query.sender?.trim(),
      fromAsset: this.normalizeAsset(query.fromAsset),
      toAsset: this.normalizeAsset(query.toAsset),
    };
  }

  private normalizeAsset(asset?: string): string | undefined {
    return asset?.trim().toUpperCase() || undefined;
  }

  private normalizeOffset(offset?: number): number {
    if (offset === undefined) {
      return 0;
    }

    if (!Number.isInteger(offset) || offset < 0) {
      return 0;
    }

    return offset;
  }

  private normalizeLimit(limit?: number): number {
    if (limit === undefined) {
      return this.config.maxSearchResults;
    }

    if (!Number.isInteger(limit) || limit <= 0) {
      return this.config.maxSearchResults;
    }

    return Math.min(limit, this.config.maxSearchResults);
  }
}