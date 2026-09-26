import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationV2Service } from './recommendation.service';
import {
  BridgeRouteDto,
  RankingPreference,
  AdvancedFiltersDto,
} from './dto/recommendation.dto';

const makeRoute = (override: Partial<BridgeRouteDto> = {}): BridgeRouteDto => ({
  id: 'route-1',
  bridgeName: 'TestBridge',
  sourceChain: 'stellar',
  destinationChain: 'ethereum',
  fee: 10,
  slippage: 0.5,
  estimatedTime: 60,
  reliabilityScore: 0.9,
  securityScore: 0.85,
  liquidity: 1_000_000,
  ...override,
});

describe('RecommendationV2Service', () => {
  let service: RecommendationV2Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecommendationV2Service],
    }).compile();

    service = module.get<RecommendationV2Service>(RecommendationV2Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recommend', () => {
    it('returns empty array for empty routes', () => {
      const result = service.recommend({ routes: [] });
      expect(result).toEqual([]);
    });

    it('returns empty array when all routes are filtered out', () => {
      const routes = [makeRoute({ fee: 100 })];
      const result = service.recommend({
        routes,
        filters: { maxFee: 50 },
      });
      expect(result).toEqual([]);
    });

    it('returns ranked routes sorted by score descending', () => {
      const routes = [
        makeRoute({ id: 'a', bridgeName: 'Alpha', fee: 100, estimatedTime: 300 }),
        makeRoute({ id: 'b', bridgeName: 'Beta', fee: 10, estimatedTime: 30 }),
      ];
      const result = service.recommend({ routes, preference: RankingPreference.FEE });
      expect(result).toHaveLength(2);
      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
      expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    });

    it('uses BALANCED as default preference', () => {
      const routes = [makeRoute()];
      const result = service.recommend({ routes });
      expect(result).toHaveLength(1);
      expect(result[0].route.bridgeName).toBe('TestBridge');
    });

    it('includes insight with reason and factors', () => {
      const routes = [makeRoute()];
      const result = service.recommend({ routes });
      expect(result[0].insight).toBeDefined();
      expect(result[0].insight.reason).toBeTruthy();
      expect(result[0].insight.factors).toBeDefined();
    });

    it('FEE preference ranks cheaper route first', () => {
      const routes = [
        makeRoute({ id: 'cheap', fee: 1, estimatedTime: 500 }),
        makeRoute({ id: 'expensive', fee: 100, estimatedTime: 10 }),
      ];
      const result = service.recommend({ routes, preference: RankingPreference.FEE });
      expect(result[0].route.id).toBe('cheap');
    });

    it('TIME preference ranks faster route first', () => {
      const routes = [
        makeRoute({ id: 'fast', fee: 100, estimatedTime: 5 }),
        makeRoute({ id: 'slow', fee: 1, estimatedTime: 500 }),
      ];
      const result = service.recommend({ routes, preference: RankingPreference.TIME });
      expect(result[0].route.id).toBe('fast');
    });

    it('SECURITY preference ranks more secure route first', () => {
      const routes = [
        makeRoute({ id: 'secure', securityScore: 0.99, fee: 100 }),
        makeRoute({ id: 'risky', securityScore: 0.3, fee: 1 }),
      ];
      const result = service.recommend({ routes, preference: RankingPreference.SECURITY });
      expect(result[0].route.id).toBe('secure');
    });

    it('RELIABILITY preference ranks more reliable route first', () => {
      const routes = [
        makeRoute({ id: 'reliable', reliabilityScore: 0.99, fee: 100 }),
        makeRoute({ id: 'unreliable', reliabilityScore: 0.2, fee: 1 }),
      ];
      const result = service.recommend({ routes, preference: RankingPreference.RELIABILITY });
      expect(result[0].route.id).toBe('reliable');
    });
  });

  describe('applyFilters', () => {
    it('removes excluded bridges', () => {
      const routes = [
        makeRoute({ bridgeName: 'Stellar' }),
        makeRoute({ bridgeName: 'LayerZero' }),
      ];
      const filters: AdvancedFiltersDto = { excludedBridges: ['Stellar'] };
      const result = service.recommend({ routes, filters });
      expect(result).toHaveLength(1);
      expect(result[0].route.bridgeName).toBe('LayerZero');
    });

    it('keeps only preferred bridges when specified', () => {
      const routes = [
        makeRoute({ bridgeName: 'Stellar' }),
        makeRoute({ bridgeName: 'LayerZero' }),
        makeRoute({ bridgeName: 'Hop' }),
      ];
      const filters: AdvancedFiltersDto = { preferredBridges: ['Stellar', 'Hop'] };
      const result = service.recommend({ routes, filters });
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.route.bridgeName).sort()).toEqual(['Hop', 'Stellar']);
    });

    it('excludedBridges takes precedence over preferredBridges', () => {
      const routes = [
        makeRoute({ bridgeName: 'Stellar' }),
        makeRoute({ bridgeName: 'LayerZero' }),
      ];
      const filters: AdvancedFiltersDto = {
        preferredBridges: ['Stellar', 'LayerZero'],
        excludedBridges: ['Stellar'],
      };
      const result = service.recommend({ routes, filters });
      expect(result).toHaveLength(1);
      expect(result[0].route.bridgeName).toBe('LayerZero');
    });

    it('filters by minLiquidity', () => {
      const routes = [
        makeRoute({ liquidity: 100 }),
        makeRoute({ liquidity: 10_000 }),
      ];
      const filters: AdvancedFiltersDto = { minLiquidity: 5_000 };
      const result = service.recommend({ routes, filters });
      expect(result).toHaveLength(1);
      expect(result[0].route.liquidity).toBe(10_000);
    });

    it('filters by maxFee', () => {
      const routes = [
        makeRoute({ fee: 5 }),
        makeRoute({ fee: 50 }),
      ];
      const filters: AdvancedFiltersDto = { maxFee: 10 };
      const result = service.recommend({ routes, filters });
      expect(result).toHaveLength(1);
      expect(result[0].route.fee).toBe(5);
    });

    it('filters by maxTime', () => {
      const routes = [
        makeRoute({ estimatedTime: 30 }),
        makeRoute({ estimatedTime: 300 }),
      ];
      const filters: AdvancedFiltersDto = { maxTime: 60 };
      const result = service.recommend({ routes, filters });
      expect(result).toHaveLength(1);
      expect(result[0].route.estimatedTime).toBe(30);
    });

    it('filters by maxSlippage', () => {
      const routes = [
        makeRoute({ slippage: 0.1 }),
        makeRoute({ slippage: 5.0 }),
      ];
      const filters: AdvancedFiltersDto = { maxSlippage: 1.0 };
      const result = service.recommend({ routes, filters });
      expect(result).toHaveLength(1);
      expect(result[0].route.slippage).toBe(0.1);
    });

    it('filters by minSecurityScore', () => {
      const routes = [
        makeRoute({ securityScore: 0.9 }),
        makeRoute({ securityScore: 0.3 }),
      ];
      const filters: AdvancedFiltersDto = { minSecurityScore: 0.5 };
      const result = service.recommend({ routes, filters });
      expect(result).toHaveLength(1);
      expect(result[0].route.securityScore).toBe(0.9);
    });

    it('applies multiple filters together', () => {
      const routes = [
        makeRoute({ bridgeName: 'Alpha', fee: 5, estimatedTime: 30, liquidity: 500 }),
        makeRoute({ bridgeName: 'Beta', fee: 50, estimatedTime: 300, liquidity: 50 }),
      ];
      const filters: AdvancedFiltersDto = {
        excludedBridges: ['Alpha'],
        maxFee: 100,
        maxTime: 500,
        minLiquidity: 10,
      };
      const result = service.recommend({ routes, filters });
      expect(result).toHaveLength(1);
      expect(result[0].route.bridgeName).toBe('Beta');
    });

    it('returns all routes when filters is undefined', () => {
      const routes = [makeRoute({ id: 'a' }), makeRoute({ id: 'b' })];
      const result = service.recommend({ routes });
      expect(result).toHaveLength(2);
    });
  });

  describe('generateInsight for the top rank', () => {
    it('returns fee reason for FEE preference', () => {
      const routes = [makeRoute()];
      const result = service.recommend({ routes, preference: RankingPreference.FEE });
      expect(result[0].insight.reason).toContain('lowest overall fees');
    });

    it('returns time reason for TIME preference', () => {
      const routes = [makeRoute()];
      const result = service.recommend({ routes, preference: RankingPreference.TIME });
      expect(result[0].insight.reason).toContain('fastest estimated');
    });

    it('returns security reason for SECURITY preference', () => {
      const routes = [makeRoute()];
      const result = service.recommend({ routes, preference: RankingPreference.SECURITY });
      expect(result[0].insight.reason).toContain('highest security');
    });

    it('returns reliability reason for RELIABILITY preference', () => {
      const routes = [makeRoute()];
      const result = service.recommend({ routes, preference: RankingPreference.RELIABILITY });
      expect(result[0].insight.reason).toContain('high historical reliability');
    });

    it('returns balanced reason for BALANCED preference', () => {
      const routes = [makeRoute()];
      const result = service.recommend({ routes, preference: RankingPreference.BALANCED });
      expect(result[0].insight.reason).toContain('balance');
    });
  });
});
