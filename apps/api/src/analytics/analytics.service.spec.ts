import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { BridgeAnalytics } from './entities/bridge-analytics.entity';
import { BridgeAnalyticsQueryDto } from './dto/bridge-analytics.dto';
import { AnalyticsUpdatePayload } from './types/analytics.types';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let repository: Repository<BridgeAnalytics>;

  const mockAnalytics: BridgeAnalytics = {
    id: 'test-id',
    bridgeName: 'hop',
    sourceChain: 'ethereum',
    destinationChain: 'polygon',
    token: 'USDC',
    totalTransfers: 100,
    successfulTransfers: 95,
    failedTransfers: 5,
    averageSettlementTimeMs: 120000,
    averageFee: 5.5,
    averageSlippagePercent: 0.5,
    totalVolume: 100000,
    minSettlementTimeMs: 60000,
    maxSettlementTimeMs: 300000,
    lastUpdated: new Date(),
    createdAt: new Date(),
    successRate: 95,
    failureRate: 5,
  };

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    clear: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
      getRawOne: jest.fn(),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(BridgeAnalytics),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    repository = module.get<Repository<BridgeAnalytics>>(
      getRepositoryToken(BridgeAnalytics),
    );

    jest.clearAllMocks();
  });

  describe('getAnalytics', () => {
    it('should return paginated analytics data', async () => {
      const query: BridgeAnalyticsQueryDto = {
        page: 1,
        limit: 10,
      };

      mockRepository.findAndCount.mockResolvedValue([[mockAnalytics], 1]);

      const result = await service.getAnalytics(query);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: {},
        order: { totalTransfers: 'DESC' },
        skip: 0,
        take: 10,
      });
    });

    it('should filter by bridge name', async () => {
      const query: BridgeAnalyticsQueryDto = {
        bridgeName: 'hop',
        page: 1,
        limit: 10,
      };

      mockRepository.findAndCount.mockResolvedValue([[mockAnalytics], 1]);

      await service.getAnalytics(query);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: { bridgeName: 'hop' },
        order: { totalTransfers: 'DESC' },
        skip: 0,
        take: 10,
      });
    });

    it('should filter by date range', async () => {
      const startDate = '2024-01-01T00:00:00.000Z';
      const endDate = '2024-01-31T23:59:59.000Z';
      const query: BridgeAnalyticsQueryDto = {
        startDate,
        endDate,
        page: 1,
        limit: 10,
      };

      mockRepository.findAndCount.mockResolvedValue([[mockAnalytics], 1]);

      await service.getAnalytics(query);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: {
          lastUpdated: Between(new Date(startDate), new Date(endDate)),
        },
        order: { totalTransfers: 'DESC' },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('getRouteAnalytics', () => {
    it('should return analytics for a specific route', async () => {
      mockRepository.findOne.mockResolvedValue(mockAnalytics);

      const result = await service.getRouteAnalytics(
        'hop',
        'ethereum',
        'polygon',
        'USDC',
      );

      expect(result).toBeDefined();
      expect(result?.bridgeName).toBe('hop');
      expect(result?.sourceChain).toBe('ethereum');
      expect(result?.destinationChain).toBe('polygon');
    });

    it('should return null for non-existent route', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getRouteAnalytics(
        'nonexistent',
        'ethereum',
        'polygon',
      );

      expect(result).toBeNull();
    });
  });

  describe('updateAnalytics', () => {
    it('should create new analytics record for new route', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({
        ...mockAnalytics,
        totalTransfers: 0,
        successfulTransfers: 0,
        failedTransfers: 0,
      });
      mockRepository.save.mockResolvedValue(mockAnalytics);

      const payload: AnalyticsUpdatePayload = {
        route: {
          bridgeName: 'hop',
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
          token: 'USDC',
        },
        settlementTimeMs: 120000,
        fee: 5.5,
        slippagePercent: 0.5,
        volume: 1000,
        status: 'success',
        timestamp: new Date(),
      };

      await service.updateAnalytics(payload);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should update existing analytics record', async () => {
      const existingAnalytics = {
        ...mockAnalytics,
        totalTransfers: 10,
        successfulTransfers: 9,
        averageSettlementTimeMs: 100000,
      };
      mockRepository.findOne.mockResolvedValue(existingAnalytics);
      mockRepository.save.mockResolvedValue(existingAnalytics);

      const payload: AnalyticsUpdatePayload = {
        route: {
          bridgeName: 'hop',
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
        },
        settlementTimeMs: 120000,
        status: 'success',
        timestamp: new Date(),
      };

      await service.updateAnalytics(payload);

      expect(mockRepository.save).toHaveBeenCalled();
      const savedCall = mockRepository.save.mock.calls[0][0];
      expect(savedCall.totalTransfers).toBe(11);
      expect(savedCall.successfulTransfers).toBe(10);
    });

    it('should increment failed transfers for failed status', async () => {
      const existingAnalytics = {
        ...mockAnalytics,
        totalTransfers: 10,
        failedTransfers: 1,
      };
      mockRepository.findOne.mockResolvedValue(existingAnalytics);
      mockRepository.save.mockResolvedValue(existingAnalytics);

      const payload: AnalyticsUpdatePayload = {
        route: {
          bridgeName: 'hop',
          sourceChain: 'ethereum',
          destinationChain: 'polygon',
        },
        status: 'failed',
        timestamp: new Date(),
      };

      await service.updateAnalytics(payload);

      const savedCall = mockRepository.save.mock.calls[0][0];
      expect(savedCall.totalTransfers).toBe(11);
      expect(savedCall.failedTransfers).toBe(2);
    });
  });

  describe('getTopPerformingBridges', () => {
    it('should return top bridges by volume, success rate, and speed', async () => {
      const mockAnalyticsList = [
        { ...mockAnalytics, bridgeName: 'hop', totalVolume: 100000, successRate: 98 },
        { ...mockAnalytics, bridgeName: 'across', totalVolume: 50000, successRate: 95 },
        { ...mockAnalytics, bridgeName: 'stargate', totalVolume: 75000, successRate: 99 },
      ];

      mockRepository.find.mockResolvedValue(mockAnalyticsList);

      const result = await service.getTopPerformingBridges(2);

      expect(result.byVolume).toHaveLength(2);
      expect(result.byVolume[0].bridgeName).toBe('hop');
      expect(result.bySuccessRate[0].bridgeName).toBe('stargate');
    });
  });

  describe('recalculateAllAnalytics', () => {
    it('should clear and recalculate all analytics', async () => {
      mockRepository.clear.mockResolvedValue(undefined);
      mockRepository.query.mockResolvedValue([
        {
          bridge_name: 'hop',
          source_chain: 'ethereum',
          destination_chain: 'polygon',
          token: 'USDC',
          total_transfers: '100',
          successful_transfers: '95',
          failed_transfers: '5',
          avg_settlement_time: '120000',
          min_settlement_time: '60000',
          max_settlement_time: '300000',
          total_volume: '100000',
        },
      ]);
      mockRepository.create.mockReturnValue(mockAnalytics);
      mockRepository.save.mockResolvedValue(mockAnalytics);

      await service.recalculateAllAnalytics();

      expect(mockRepository.clear).toHaveBeenCalled();
      expect(mockRepository.query).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });
});
