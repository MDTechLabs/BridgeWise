import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationV2Controller } from './recommendation.controller';
import { RecommendationV2Service } from './recommendation.service';
import { RecommendationRequestV2Dto, RankedRouteV2Dto } from './dto/recommendation.dto';

describe('RecommendationV2Controller', () => {
  let controller: RecommendationV2Controller;
  let service: RecommendationV2Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecommendationV2Controller],
      providers: [RecommendationV2Service],
    }).compile();

    controller = module.get<RecommendationV2Controller>(RecommendationV2Controller);
    service = module.get<RecommendationV2Service>(RecommendationV2Service);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getRecommendations', () => {
    it('returns success response with recommendations', async () => {
      const dto: RecommendationRequestV2Dto = {
        routes: [
          {
            id: '1',
            bridgeName: 'Stellar',
            sourceChain: 'stellar',
            destinationChain: 'ethereum',
            fee: 10,
            slippage: 0.5,
            estimatedTime: 60,
            reliabilityScore: 0.9,
            securityScore: 0.85,
            liquidity: 1_000_000,
          },
        ],
        preference: undefined,
        filters: undefined,
      };

      const result = await controller.getRecommendations(dto);

      expect(result.success).toBe(true);
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations).toHaveLength(1);
    });

    it('returns empty recommendations for empty routes', async () => {
      const dto: RecommendationRequestV2Dto = {
        routes: [],
        preference: undefined,
        filters: undefined,
      };

      const result = await controller.getRecommendations(dto);

      expect(result.success).toBe(true);
      expect(result.recommendations).toEqual([]);
    });

    it('passes filters to the service correctly', async () => {
      const dto: RecommendationRequestV2Dto = {
        routes: [
          {
            id: '1',
            bridgeName: 'Stellar',
            sourceChain: 'stellar',
            destinationChain: 'ethereum',
            fee: 10,
            slippage: 0.5,
            estimatedTime: 60,
          },
        ],
        preference: undefined,
        filters: {
          minLiquidity: 1000,
          maxFee: 50,
          excludedBridges: ['LayerZero'],
          preferredBridges: ['Stellar'],
        },
      };

      const result = await controller.getRecommendations(dto);
      expect(result.success).toBe(true);
      expect(result.recommendations).toHaveLength(1);
    });

    it('applies SECURITY ranking preference', async () => {
      const dto: RecommendationRequestV2Dto = {
        routes: [
          {
            id: '1',
            bridgeName: 'Alpha',
            sourceChain: 'stellar',
            destinationChain: 'ethereum',
            fee: 50,
            slippage: 0.5,
            estimatedTime: 100,
            securityScore: 0.99,
          },
          {
            id: '2',
            bridgeName: 'Beta',
            sourceChain: 'stellar',
            destinationChain: 'ethereum',
            fee: 1,
            slippage: 0.1,
            estimatedTime: 10,
            securityScore: 0.2,
          },
        ],
        preference: 'SECURITY' as any,
        filters: undefined,
      };

      const result = await controller.getRecommendations(dto);
      expect(result.success).toBe(true);
    });

    it('returns ranked recommendations with scores', async () => {
      const dto: RecommendationRequestV2Dto = {
        routes: [
          {
            id: 'fast',
            bridgeName: 'FastBridge',
            sourceChain: 'stellar',
            destinationChain: 'ethereum',
            fee: 100,
            slippage: 0.5,
            estimatedTime: 5,
          },
          {
            id: 'slow',
            bridgeName: 'SlowBridge',
            sourceChain: 'stellar',
            destinationChain: 'ethereum',
            fee: 1,
            slippage: 0.1,
            estimatedTime: 500,
          },
        ],
        preference: 'TIME' as any,
        filters: undefined,
      };

      const result = await controller.getRecommendations(dto);
      expect(result.recommendations[0].rank).toBe(1);
      expect(result.recommendations[0].route.id).toBe('fast');
      expect(result.recommendations[0].score).toBeGreaterThan(0);
    });
  });
});
