import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, FindOptionsWhere } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { BridgeAnalytics } from '../../../analytics/entities/bridge-analytics.entity';
import { StellarAnalyticsService } from '../../../analytics/stellar/stellar-analytics.service';
import {
  BridgeRoute,
  recommendBridgeRoutes,
} from '../../../bridge-recommendation/bridge-recommendation.engine';
import {
  RouteInsightsExportDto,
  ExportFormat,
  RouteInsightDataDto,
  RouteInsightsExportResponseDto,
} from './dto/route-insights-export.dto';
import { CsvBuilderUtil } from '../../../Analytics-Export/csv-builder.util';
import { getAllChains } from '../../../config/chains.config';
import { BridgeAnalyticsQueryDto } from '../../../analytics/dto/bridge-analytics.dto';

const SYNC_ROW_LIMIT = 5_000;

/**
 * Stellar Route Insights Exporter Service
 *
 * Handles exporting route analytics and recommendation insights for Stellar bridges.
 * Supports multiple export formats (CSV, JSON) with async processing for large datasets.
 */
@Injectable()
export class RouteInsightsExporterService {
  private readonly logger = new Logger(RouteInsightsExporterService.name);

  constructor(
    @InjectRepository(BridgeAnalytics)
    private readonly analyticsRepository: Repository<BridgeAnalytics>,
    private readonly stellarAnalyticsService: StellarAnalyticsService,
    private readonly csvBuilder: CsvBuilderUtil,
  ) {}

  /**
   * Initiate route insights export
   */
  async exportRouteInsights(
    userId: string,
    dto: RouteInsightsExportDto,
  ): Promise<RouteInsightsExportResponseDto> {
    const exportId = uuidv4();

    // Build query for Stellar routes
    const query = this.buildAnalyticsQuery(dto);

    // Fetch route analytics
    const analyticsResponse =
      await this.stellarAnalyticsService.getStellarAnalytics(query);
    const routes = analyticsResponse.data;

    if (routes.length === 0) {
      throw new NotFoundException(
        'No Stellar routes found matching the criteria',
      );
    }

    // Check size limits
    if (routes.length > SYNC_ROW_LIMIT && !dto.async) {
      throw new BadRequestException(
        `Dataset too large (${routes.length} routes). Use async=true for large exports.`,
      );
    }

    // Build insights data
    const insightsData = await this.buildInsightsData(
      routes,
      dto.includeRecommendations ?? true,
      dto.includeRanking ?? true,
    );

    // Generate export based on format
    if (dto.format === ExportFormat.JSON) {
      return this.generateJsonExport(exportId, insightsData, userId);
    } else {
      return this.generateCsvExport(
        exportId,
        insightsData,
        dto.delimiter ?? ',',
        userId,
      );
    }
  }

  /**
   * Build route insights data with recommendations and metrics
   */
  private async buildInsightsData(
    routes: any[],
    includeRecommendations: boolean,
    includeRanking: boolean,
  ): Promise<RouteInsightDataDto[]> {
    const insightsData: RouteInsightDataDto[] = [];

    // Convert routes to bridge routes for recommendation scoring
    const bridgeRoutes: BridgeRoute[] = routes.map((route) => ({
      bridgeName: route.bridgeName,
      sourceChain: route.sourceChain,
      destinationChain: route.destinationChain,
      token: route.token || '',
      fee: route.averageFee ? Number(route.averageFee) : 0,
      slippage: route.averageSlippagePercent
        ? Number(route.averageSlippagePercent)
        : 0,
      estimatedTime: route.averageSettlementTimeMs
        ? Number(route.averageSettlementTimeMs)
        : 0,
      reliabilityScore: route.successRate / 100,
      historicalSuccessRate: route.successRate / 100,
    }));

    // Get recommendations if requested
    let recommendations: any[] = [];
    if (includeRecommendations && bridgeRoutes.length > 0) {
      const recommendationResult = recommendBridgeRoutes({
        sourceChain: bridgeRoutes[0].sourceChain,
        destinationChain: bridgeRoutes[0].destinationChain,
        token: bridgeRoutes[0].token,
        amount: 1,
        account: 'insights-export',
        routes: bridgeRoutes,
      });
      recommendations = recommendationResult.rankedRoutes;
    }

    // Build insights combining analytics and recommendations
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const recommendation = recommendations.find(
        (r) => r.route.bridgeName === route.bridgeName,
      );

      const insight: RouteInsightDataDto = {
        bridgeName: route.bridgeName,
        sourceChain: route.sourceChain,
        destinationChain: route.destinationChain,
        token: route.token,
        totalTransfers: route.totalTransfers,
        successfulTransfers: route.successfulTransfers,
        failedTransfers: route.failedTransfers,
        successRate: Number(route.successRate.toFixed(2)),
        averageSettlementTimeMs: route.averageSettlementTimeMs
          ? Number(route.averageSettlementTimeMs)
          : undefined,
        averageFee: route.averageFee ? Number(route.averageFee) : undefined,
        averageSlippagePercent: route.averageSlippagePercent
          ? Number(route.averageSlippagePercent)
          : undefined,
        totalVolume: Number(route.totalVolume.toFixed(10)),
        lastUpdated: route.lastUpdated,
      };

      if (includeRanking && recommendation) {
        insight.recommendationRank =
          recommendations.indexOf(recommendation) + 1;
        insight.recommendationScore = Number(recommendation.score.toFixed(2));
      }

      insightsData.push(insight);
    }

    // Sort by rank if available
    if (includeRanking) {
      insightsData.sort(
        (a, b) => (a.recommendationRank ?? 999) - (b.recommendationRank ?? 999),
      );
    }

    return insightsData;
  }

  /**
   * Generate CSV export
   */
  private generateCsvExport(
    exportId: string,
    data: RouteInsightDataDto[],
    delimiter: string,
    userId: string,
  ): RouteInsightsExportResponseDto {
    const csv = this.buildCsv(data, delimiter);
    const fileName = this.buildFileName(
      'stellar-route-insights',
      ExportFormat.CSV,
    );

    this.logger.log(
      `CSV export generated: id=${exportId}, user=${userId}, rows=${data.length}, size=${this.csvBuilder.estimateSize(csv)}B`,
    );

    return {
      exportId,
      format: ExportFormat.CSV,
      rowCount: data.length,
      downloadUrl: `/api/exporters/routes/stellar/download/${exportId}`,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate JSON export
   */
  private generateJsonExport(
    exportId: string,
    data: RouteInsightDataDto[],
    userId: string,
  ): RouteInsightsExportResponseDto {
    const jsonContent = JSON.stringify(
      {
        metadata: {
          exportId,
          exportedAt: new Date().toISOString(),
          format: 'json',
          rowCount: data.length,
        },
        data,
      },
      null,
      2,
    );

    const fileName = this.buildFileName(
      'stellar-route-insights',
      ExportFormat.JSON,
    );

    this.logger.log(
      `JSON export generated: id=${exportId}, user=${userId}, rows=${data.length}, size=${Buffer.byteLength(jsonContent, 'utf8')}B`,
    );

    return {
      exportId,
      format: ExportFormat.JSON,
      rowCount: data.length,
      downloadUrl: `/api/exporters/routes/stellar/download/${exportId}`,
      generatedAt: new Date(),
    };
  }

  /**
   * Build CSV from insights data
   */
  private buildCsv(data: RouteInsightDataDto[], delimiter: string): string {
    const columns = [
      { key: 'bridgeName', header: 'Bridge Name' },
      { key: 'sourceChain', header: 'Source Chain' },
      { key: 'destinationChain', header: 'Destination Chain' },
      { key: 'token', header: 'Token' },
      { key: 'totalTransfers', header: 'Total Transfers' },
      { key: 'successfulTransfers', header: 'Successful Transfers' },
      { key: 'failedTransfers', header: 'Failed Transfers' },
      { key: 'successRate', header: 'Success Rate (%)' },
      { key: 'averageSettlementTimeMs', header: 'Avg Settlement Time (ms)' },
      { key: 'averageFee', header: 'Average Fee' },
      { key: 'averageSlippagePercent', header: 'Average Slippage (%)' },
      { key: 'totalVolume', header: 'Total Volume' },
      { key: 'recommendationRank', header: 'Recommendation Rank' },
      { key: 'recommendationScore', header: 'Recommendation Score' },
      { key: 'lastUpdated', header: 'Last Updated' },
    ];

    const buildOptions = {
      columns,
      delimiter,
      includeHeader: true,
      nullPlaceholder: '',
    };

    return this.csvBuilder.build(data as any, buildOptions);
  }

  /**
   * Build analytics query from DTO
   */
  private buildAnalyticsQuery(
    dto: RouteInsightsExportDto,
  ): BridgeAnalyticsQueryDto {
    return {
      sourceChain: dto.sourceChain,
      destinationChain: dto.destinationChain,
      bridgeName: dto.bridgeName,
      token: dto.token,
      startDate: dto.startDate,
      endDate: dto.endDate,
      limit: 1000, // High limit for analytics
    };
  }

  /**
   * Build file name for export
   */
  private buildFileName(prefix: string, format: ExportFormat): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const ext = format === ExportFormat.CSV ? 'csv' : 'json';
    return `${prefix}_${timestamp}.${ext}`;
  }

  /**
   * Get export status (for async exports in future)
   */
  async getExportStatus(exportId: string, userId: string): Promise<any> {
    // Future implementation for async export tracking
    throw new NotFoundException(`Export ${exportId} not found`);
  }

  /**
   * List user exports (for future)
   */
  async listUserExports(userId: string): Promise<any[]> {
    // Future implementation
    return [];
  }
}
