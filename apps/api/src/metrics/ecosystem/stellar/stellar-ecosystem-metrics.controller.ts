import { Controller, Get, Query, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { StellarEcosystemMetricsService } from './stellar-ecosystem-metrics.service';
import {
  StellarTransferMetrics,
  StellarProviderMetrics,
  StellarEcosystemSummary,
} from './stellar-ecosystem-metrics.types';

/**
 * Stellar Ecosystem Metrics Controller
 *
 * REST API endpoints for Stellar/Soroban ecosystem metrics.
 */
@ApiTags('Stellar Ecosystem Metrics')
@Controller('api/v1/metrics/ecosystem/stellar')
export class StellarEcosystemMetricsController {
  constructor(
    private readonly metricsService: StellarEcosystemMetricsService,
  ) {}

  /**
   * Get overall transfer metrics
   */
  @Get('transfers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get Stellar ecosystem transfer metrics',
    description: 'Returns overall transfer metrics (volume, success rate, etc.) for Stellar/Soroban bridges.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transfer metrics retrieved successfully',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'ISO 8601 start date' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'ISO 8601 end date' })
  async getTransferMetrics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<StellarTransferMetrics> {
    return this.metricsService.collectTransferMetrics(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * Get provider metrics
   */
  @Get('providers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get Stellar ecosystem provider metrics',
    description: 'Returns per-provider metrics (transfers, volume, success rate, etc.) for Stellar/Soroban bridges.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Provider metrics retrieved successfully',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'ISO 8601 start date' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'ISO 8601 end date' })
  async getProviderMetrics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<StellarProviderMetrics[]> {
    return this.metricsService.collectProviderMetrics(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * Get full ecosystem summary
   */
  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get Stellar ecosystem summary',
    description: 'Returns a comprehensive ecosystem summary including overall metrics, top providers, top tokens, etc.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Ecosystem summary retrieved successfully',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'ISO 8601 start date' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'ISO 8601 end date' })
  async getEcosystemSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<StellarEcosystemSummary> {
    return this.metricsService.generateEcosystemSummary({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }
}
