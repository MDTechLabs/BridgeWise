import { StellarRouteAuditAPI } from './audit.service';
import { AuditAction, AuditStatus } from './audit.types';

describe('StellarRouteAuditAPI', () => {
  let auditAPI: StellarRouteAuditAPI;

  const createRecommendationPayload = (
    overrides: Partial<Parameters<StellarRouteAuditAPI['logRecommendationAction']>[0]> = {},
  ) => ({
    recommendationId: 'rec-123',
    action: AuditAction.RECOMMENDATION_REQUESTED,
    actor: 'user-1',
    fromAsset: 'USDC',
    toAsset: 'XLM',
    amount: '100',
    sender: 'GBAD...',
    status: AuditStatus.PENDING,
    ...overrides,
  });

  beforeEach(() => {
    auditAPI = new StellarRouteAuditAPI({
      maxSearchResults: 5,
    });
  });

  describe('logRecommendationAction', () => {
    it('should successfully log a route recommendation action', () => {
      const before = Date.now();

      const log = auditAPI.logRecommendationAction(
        createRecommendationPayload(),
      );

      const after = Date.now();

      expect(log).toMatchObject({
        recommendationId: 'rec-123',
        action: AuditAction.RECOMMENDATION_REQUESTED,
        actor: 'user-1',
        fromAsset: 'USDC',
        toAsset: 'XLM',
        amount: '100',
        sender: 'GBAD...',
        status: AuditStatus.PENDING,
      });

      expect(log.auditId).toBeDefined();
      expect(log.auditId).not.toBe('');
      expect(log.timestamp).toBeGreaterThanOrEqual(before);
      expect(log.timestamp).toBeLessThanOrEqual(after);
    });

    it('should preserve optional route information when provided', () => {
      const log = auditAPI.logRecommendationAction(
        createRecommendationPayload({
          action: AuditAction.ROUTES_RANKED,
          actor: 'system',
          selectedRouteId: 'route-1',
          selectedProvider: 'provider-a',
          routesConsidered: 3,
          status: AuditStatus.COMPLETED,
        }),
      );

      expect(log).toMatchObject({
        selectedRouteId: 'route-1',
        selectedProvider: 'provider-a',
        routesConsidered: 3,
        status: AuditStatus.COMPLETED,
      });
    });

    it('should preserve error information for failed recommendations', () => {
      const log = auditAPI.logRecommendationAction(
        createRecommendationPayload({
          action: AuditAction.RECOMMENDATION_FAILED,
          actor: 'system',
          status: AuditStatus.FAILED,
          errorMessage: 'No routes found',
        }),
      );

      expect(log).toMatchObject({
        action: AuditAction.RECOMMENDATION_FAILED,
        status: AuditStatus.FAILED,
        errorMessage: 'No routes found',
      });
    });

    it('should generate unique audit IDs for separate logs', () => {
      const first = auditAPI.logRecommendationAction(
        createRecommendationPayload({
          recommendationId: 'rec-1',
        }),
      );

      const second = auditAPI.logRecommendationAction(
        createRecommendationPayload({
          recommendationId: 'rec-2',
        }),
      );

      expect(first.auditId).not.toBe(second.auditId);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      auditAPI.logRecommendationAction(
        createRecommendationPayload({
          recommendationId: 'rec-1',
          action: AuditAction.RECOMMENDATION_REQUESTED,
          actor: 'user-1',
          fromAsset: 'USDC',
          toAsset: 'XLM',
          amount: '100',
          status: AuditStatus.PENDING,
        }),
      );

      auditAPI.logRecommendationAction(
        createRecommendationPayload({
          recommendationId: 'rec-1',
          action: AuditAction.ROUTES_RANKED,
          actor: 'system',
          fromAsset: 'USDC',
          toAsset: 'XLM',
          amount: '100',
          selectedRouteId: 'route-opt-1',
          selectedProvider: 'provider-a',
          routesConsidered: 3,
          status: AuditStatus.COMPLETED,
        }),
      );

      auditAPI.logRecommendationAction(
        createRecommendationPayload({
          recommendationId: 'rec-2',
          action: AuditAction.RECOMMENDATION_FAILED,
          actor: 'system',
          fromAsset: 'EURC',
          toAsset: 'XLM',
          amount: '500',
          status: AuditStatus.FAILED,
          errorMessage: 'No routes found',
        }),
      );
    });

    it('should return all matching logs when no filters are provided', async () => {
      const result = await auditAPI.search({});

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(3);
    });

    it('should return an empty result when there are no matches', async () => {
      const result = await auditAPI.search({
        recommendationIds: ['does-not-exist'],
      });

      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('should search by recommendation ID', async () => {
      const result = await auditAPI.search({
        recommendationIds: ['rec-1'],
      });

      expect(result.total).toBe(2);
      expect(
        result.items.every((item) => item.recommendationId === 'rec-1'),
      ).toBe(true);
    });

    it('should search by action', async () => {
      const result = await auditAPI.search({
        actions: [AuditAction.RECOMMENDATION_FAILED],
      });

      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        recommendationId: 'rec-2',
        action: AuditAction.RECOMMENDATION_FAILED,
        status: AuditStatus.FAILED,
      });
    });

    it('should search by status', async () => {
      const result = await auditAPI.search({
        status: [AuditStatus.FAILED],
      });

      expect(result.total).toBe(1);
      expect(result.items[0].recommendationId).toBe('rec-2');
    });

    it('should search by source asset', async () => {
      const result = await auditAPI.search({
        fromAsset: 'EURC',
      });

      expect(result.total).toBe(1);
      expect(result.items[0].fromAsset).toBe('EURC');
    });

    it('should search by destination asset', async () => {
      const result = await auditAPI.search({
        toAsset: 'XLM',
      });

      expect(result.total).toBe(3);
      expect(result.items.every((item) => item.toAsset === 'XLM')).toBe(true);
    });

    it('should support multiple filters together', async () => {
      const result = await auditAPI.search({
        recommendationIds: ['rec-1'],
        actions: [AuditAction.ROUTES_RANKED],
        status: [AuditStatus.COMPLETED],
      });

      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        recommendationId: 'rec-1',
        action: AuditAction.ROUTES_RANKED,
        status: AuditStatus.COMPLETED,
      });
    });

    it('should return no results when combined filters do not match the same log', async () => {
      const result = await auditAPI.search({
        recommendationIds: ['rec-1'],
        status: [AuditStatus.FAILED],
      });

      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('should respect maxSearchResults config limit', async () => {
      for (let i = 0; i < 5; i++) {
        auditAPI.logRecommendationAction(
          createRecommendationPayload({
            recommendationId: `rec-limit-${i}`,
          }),
        );
      }

      const result = await auditAPI.search({});

      expect(result.total).toBe(8);
      expect(result.items).toHaveLength(5);
    });

    it('should allow a smaller explicit limit than maxSearchResults', async () => {
      const result = await auditAPI.search({
        limit: 2,
      });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
      expect(result.limit).toBe(2);
    });

    it('should paginate correctly using limit and offset', async () => {
      const result = await auditAPI.search({
        limit: 2,
        offset: 1,
      });

      expect(result.items).toHaveLength(2);
      expect(result.offset).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('should return remaining records when offset is near the end', async () => {
      const result = await auditAPI.search({
        limit: 5,
        offset: 2,
      });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(1);
    });

    it('should return an empty page when offset exceeds total results', async () => {
      const result = await auditAPI.search({
        limit: 5,
        offset: 100,
      });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(0);
      expect(result.offset).toBe(100);
    });
  });

  describe('getRecommendationHistory', () => {
    it('should retrieve history for a specific recommendation', async () => {
      auditAPI.logRecommendationAction(
        createRecommendationPayload({
          recommendationId: 'rec-history-1',
          action: AuditAction.RECOMMENDATION_REQUESTED,
        }),
      );

      const history = await auditAPI.getRecommendationHistory(
        'rec-history-1',
      );

      expect(history).toHaveLength(1);
      expect(history[0].recommendationId).toBe('rec-history-1');
    });

    it('should return all events belonging to the recommendation', async () => {
      auditAPI.logRecommendationAction(
        createRecommendationPayload({
          recommendationId: 'rec-history-1',
          action: AuditAction.RECOMMENDATION_REQUESTED,
        }),
      );

      auditAPI.logRecommendationAction(
        createRecommendationPayload({
          recommendationId: 'rec-history-1',
          action: AuditAction.ROUTES_RANKED,
          actor: 'system',
          status: AuditStatus.COMPLETED,
        }),
      );

      auditAPI.logRecommendationAction(
        createRecommendationPayload({
          recommendationId: 'rec-history-2',
        }),
      );

      const history = await auditAPI.getRecommendationHistory(
        'rec-history-1',
      );

      expect(history).toHaveLength(2);
      expect(
        history.every(
          (item) => item.recommendationId === 'rec-history-1',
        ),
      ).toBe(true);
    });

    it('should return an empty array for an unknown recommendation', async () => {
      const history = await auditAPI.getRecommendationHistory(
        'does-not-exist',
      );

      expect(history).toEqual([]);
    });
  });

  describe('getAuditLog', () => {
    it('should retrieve a specific log by audit ID', () => {
      const logged = auditAPI.logRecommendationAction(
        createRecommendationPayload({
          recommendationId: 'rec-get-1',
        }),
      );

      const retrieved = auditAPI.getAuditLog(logged.auditId);

      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(logged);
    });

    it('should return undefined for a non-existent audit ID', () => {
      expect(
        auditAPI.getAuditLog('non-existent-id'),
      ).toBeUndefined();
    });
  });

  describe('test isolation', () => {
    it('should start each test with an empty audit store', async () => {
      const result = await auditAPI.search({});

      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });
});