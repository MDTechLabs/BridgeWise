import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RouteInsightsExporterService } from './route-insights-exporter.service';
import { StellarAnalyticsService } from '../../../analytics/stellar/stellar-analytics.service';
import { BridgeAnalytics } from '../../../analytics/entities/bridge-analytics.entity';
import { CsvBuilderUtil } from '../../../Analytics-Export/csv-builder.util';
import { RouteInsightsExportDto, ExportFormat } from './dto/route-insights-export.dto';
import { NotFoundException } from '@nestjs/common';

describe('RouteInsightsExporterService', () => {
  let service: RouteInsightsExporterService;
  let mockAnalyticsRepo: any;
  let mockStellarAnalyticsService: any;
  let mockCsvBuilder: any;

  beforeEach(async () => {
    // Mock dependencies
    mockAnalyticsRepo = {};

    mockStellarAnalyticsService = {
      getStellarAnalytics: jest.fn(),
    };

    mockCsvBuilder = {
      build: jest.fn(),
      estimateSize: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteInsightsExporterService,
        {
          provide: getRepositoryToken(BridgeAnalytics),
          useValue: mockAnalyticsRepo,
        },
        {
          provide: StellarAnalyticsService,
          useValue: mockStellarAnalyticsService,
        },
        {
          provide: CsvBuilderUtil,
          useValue: mockCsvBuilder,
        },
      ],
    }).compile();

    service = module.get<RouteInsightsExporterService>(RouteInsightsExporterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw NotFoundException when no routes found', async () => {
    const dto: RouteInsightsExportDto = {
      format: ExportFormat.CSV,
    };

    mockStellarAnalyticsService.getStellarAnalytics.mockResolvedValue({
      data: [],
      total: 0,
    });

    await expect(service.exportRouteInsights('user-123', dto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw BadRequestException for large sync exports', async () => {
    const dto: RouteInsightsExportDto = {
      format: ExportFormat.CSV,
      async: false,
    };

    // Create array of routes larger than SYNC_ROW_LIMIT (5000)
    const largeRoutes = Array.from({ length: 5001 }, (_, i) => ({
      bridgeName: `bridge-${i}`,
      sourceChain: 'Stellar',
      destinationChain: 'Ethereum',
      totalTransfers: 100,
      successfulTransfers: 95,
      failedTransfers: 5,
      successRate: 95,
      totalVolume: 1000,
      lastUpdated: new Date(),
    }));

    mockStellarAnalyticsService.getStellarAnalytics.mockResolvedValue({
      data: largeRoutes,
      total: largeRoutes.length,
    });

    await expect(service.exportRouteInsights('user-123', dto)).rejects.toThrow();
  });

  it('should successfully export route insights', async () => {
    const dto: RouteInsightsExportDto = {
      format: ExportFormat.CSV,
      includeRecommendations: true,
      includeRanking: true,
    };

    const mockRoutes = [
      {
        bridgeName: 'Stellar-Bridge',
        sourceChain: 'Stellar',
        destinationChain: 'Ethereum',
        token: 'USDC',
        totalTransfers: 100,
        successfulTransfers: 95,
        failedTransfers: 5,
        successRate: 95,
        averageSettlementTimeMs: 30000,
        averageFee: 0.5,
        averageSlippagePercent: 0.1,
        totalVolume: 100000,
        lastUpdated: new Date(),
      },
    ];

    mockStellarAnalyticsService.getStellarAnalytics.mockResolvedValue({
      data: mockRoutes,
      total: 1,
    });

    mockCsvBuilder.build.mockReturnValue('csv,data');
    mockCsvBuilder.estimateSize.mockReturnValue(8);

    const result = await service.exportRouteInsights('user-123', dto);

    expect(result).toHaveProperty('exportId');
    expect(result).toHaveProperty('format', ExportFormat.CSV);
    expect(result).toHaveProperty('rowCount', 1);
    expect(result).toHaveProperty('downloadUrl');
    expect(result).toHaveProperty('generatedAt');
  });
});
