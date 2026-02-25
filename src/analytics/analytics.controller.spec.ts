import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { BridgeAnalyticsQueryDto } from './dto/bridge-analytics.dto';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: AnalyticsService;

  const mockAnalyticsService = {
    getAnalytics: jest.fn(),
    getRouteAnalytics: jest.fn(),
    getTimeSeriesAnalytics: jest.fn(),
    getTopPerformingBridges: jest.fn(),
    getSlippageStatistics: jest.fn(),
    getUserActivityInsights: jest.fn(),
    recalculateAllAnalytics: jest.fn(),
  };

  const mockRouteAnalytics = {
    bridgeName: 'hop',
    sourceChain: 'ethereum',
    destinationChain: 'polygon',
    token: 'USDC',
    totalTransfers: 100,
    successfulTransfers: 95,
    failedTransfers: 5,
    successRate: 95,
    failureRate: 5,
    averageSettlementTimeMs: 120000,
    totalVolume: 100000,
    lastUpdated: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get<AnalyticsService>(AnalyticsService);

    jest.clearAllMocks();
  });

  describe('getAnalytics', () => {
    it('should return analytics data', async () => {
      const mockResponse = {
        data: [mockRouteAnalytics],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
        generatedAt: new Date(),
      };

      mockAnalyticsService.getAnalytics.mockResolvedValue(mockResponse);

      const query: BridgeAnalyticsQueryDto = {
        page: 1,
        limit: 50,
      };

      const result = await controller.getAnalytics(query);

      expect(result).toEqual(mockResponse);
      expect(mockAnalyticsService.getAnalytics).toHaveBeenCalledWith(query);
    });

    it('should filter by bridge name', async () => {
      const mockResponse = {
        data: [mockRouteAnalytics],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
        generatedAt: new Date(),
      };

      mockAnalyticsService.getAnalytics.mockResolvedValue(mockResponse);

      const query: BridgeAnalyticsQueryDto = {
        bridgeName: 'hop',
        page: 1,
        limit: 50,
      };

      await controller.getAnalytics(query);

      expect(mockAnalyticsService.getAnalytics).toHaveBeenCalledWith(query);
    });
  });

  describe('getRouteAnalytics', () => {
    it('should return route analytics', async () => {
      mockAnalyticsService.getRouteAnalytics.mockResolvedValue(mockRouteAnalytics);

      const result = await controller.getRouteAnalytics(
        'hop',
        'ethereum',
        'polygon',
        'USDC',
      );

      expect(result.bridgeName).toBe('hop');
      expect(mockAnalyticsService.getRouteAnalytics).toHaveBeenCalledWith(
        'hop',
        'ethereum',
        'polygon',
        'USDC',
      );
    });

    it('should return empty analytics for new routes', async () => {
      mockAnalyticsService.getRouteAnalytics.mockResolvedValue(null);

      const result = await controller.getRouteAnalytics(
        'new-bridge',
        'ethereum',
        'polygon',
      );

      expect(result.totalTransfers).toBe(0);
      expect(result.successfulTransfers).toBe(0);
      expect(result.successRate).toBe(0);
    });
  });

  describe('getTimeSeriesAnalytics', () => {
    it('should return time series data', async () => {
      const mockTimeSeries = {
        bridgeName: 'hop',
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        granularity: 'day',
        data: [
          {
            timestamp: new Date(),
            transfers: 10,
            successfulTransfers: 9,
            failedTransfers: 1,
            totalVolume: 10000,
          },
        ],
      };

      mockAnalyticsService.getTimeSeriesAnalytics.mockResolvedValue(mockTimeSeries);

      const result = await controller.getTimeSeriesAnalytics(
        'hop',
        'ethereum',
        'polygon',
        'day',
        '2024-01-01T00:00:00.000Z',
        '2024-01-31T23:59:59.000Z',
      );

      expect(result.granularity).toBe('day');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getTopPerformingBridges', () => {
    it('should return top performing bridges', async () => {
      const mockTopPerforming = {
        byVolume: [mockRouteAnalytics],
        bySuccessRate: [mockRouteAnalytics],
        bySpeed: [mockRouteAnalytics],
        generatedAt: new Date(),
      };

      mockAnalyticsService.getTopPerformingBridges.mockResolvedValue(mockTopPerforming);

      const result = await controller.getTopPerformingBridges('5');

      expect(result.byVolume).toHaveLength(1);
      expect(mockAnalyticsService.getTopPerformingBridges).toHaveBeenCalledWith(5);
    });

    it('should use default limit when not provided', async () => {
      mockAnalyticsService.getTopPerformingBridges.mockResolvedValue({
        byVolume: [],
        bySuccessRate: [],
        bySpeed: [],
        generatedAt: new Date(),
      });

      await controller.getTopPerformingBridges();

      expect(mockAnalyticsService.getTopPerformingBridges).toHaveBeenCalledWith(10);
    });
  });

  describe('getSlippageStatistics', () => {
    it('should return slippage statistics', async () => {
      const mockSlippageStats = {
        bridgeName: 'hop',
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
        averageSlippagePercent: 0.5,
        minSlippagePercent: 0.1,
        maxSlippagePercent: 2.0,
        highSlippageCount: 5,
        highSlippagePercentage: 5,
        distribution: [],
      };

      mockAnalyticsService.getSlippageStatistics.mockResolvedValue(mockSlippageStats);

      const result = await controller.getSlippageStatistics(
        'hop',
        'ethereum',
        'polygon',
      );

      expect(result).toEqual(mockSlippageStats);
    });

    it('should return message when no data available', async () => {
      mockAnalyticsService.getSlippageStatistics.mockResolvedValue(null);

      const result = await controller.getSlippageStatistics(
        'hop',
        'ethereum',
        'polygon',
      );

      expect(result).toHaveProperty('message');
    });
  });

  describe('getUserActivityInsights', () => {
    it('should return user activity insights', async () => {
      const mockInsights = {
        totalUniqueUsers: 1000,
        totalTransfers: 5000,
        averageTransfersPerUser: 5,
        peakActivityPeriod: { hour: 14, transferCount: 150 },
        popularRoutes: [mockRouteAnalytics],
        generatedAt: new Date(),
      };

      mockAnalyticsService.getUserActivityInsights.mockResolvedValue(mockInsights);

      const result = await controller.getUserActivityInsights();

      expect(result.totalTransfers).toBe(5000);
      expect(result.popularRoutes).toHaveLength(1);
    });
  });

  describe('recalculateAnalytics', () => {
    it('should trigger analytics recalculation', async () => {
      mockAnalyticsService.recalculateAllAnalytics.mockResolvedValue(undefined);

      const result = await controller.recalculateAnalytics();

      expect(result.message).toBe('Analytics recalculation completed successfully');
      expect(mockAnalyticsService.recalculateAllAnalytics).toHaveBeenCalled();
    });
  });
});
