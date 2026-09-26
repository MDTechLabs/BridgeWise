import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import type { Response as ExpressResponse, Request as ExpressRequest } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { RouteInsightsExporterService } from './route-insights-exporter.service';
import {
  RouteInsightsExportDto,
  RouteInsightsExportResponseDto,
  ExportFormat,
} from './dto/route-insights-export.dto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Placeholder JWT guard — swap for your actual AuthGuard
 */
@Injectable()
class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    return !!(req as Request & { user?: unknown }).user;
  }
}

@ApiTags('Exporters')
@Controller('exporters/routes/stellar')
@UseGuards(AuthGuard)
export class RouteInsightsExporterController {
  constructor(private readonly exporterService: RouteInsightsExporterService) {}

  /**
   * POST /exporters/routes/stellar/export
   *
   * Export Stellar route insights with analytics and recommendations.
   * Supports CSV and JSON formats.
   *
   * Returns:
   * - Sync: Immediate file download
   * - Async: Job reference with polling URL
   */
  @Post('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export Stellar route insights',
    description:
      'Export route analytics and recommendation insights for Stellar bridges. ' +
      'Supports CSV and JSON formats. Use async=true for large datasets.',
  })
  @ApiResponse({
    status: 200,
    description: 'Export completed successfully',
    schema: {
      example: {
        exportId: 'uuid',
        format: 'csv',
        rowCount: 42,
        downloadUrl: '/api/exporters/routes/stellar/download/uuid',
        generatedAt: '2024-01-15T10:30:00Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid export parameters' })
  @ApiResponse({
    status: 404,
    description: 'No routes found matching criteria',
  })
  async exportRouteInsights(
    @Query() dto: RouteInsightsExportDto,
    @Req() req: ExpressRequest & { user: { id: string } },
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const userId = req.user.id;
    const result = await this.exporterService.exportRouteInsights(userId, dto);

    // For now, all exports are sync and return JSON metadata + file info
    if (dto.format === ExportFormat.JSON) {
      res.setHeader('Content-Type', 'application/json');
      res.json(result);
    } else {
      // CSV is returned as downloadable file
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="stellar-route-insights.csv"',
      );
      res.json(result);
    }
  }

  /**
   * GET /exporters/routes/stellar/download/:exportId
   *
   * Download previously generated export
   */
  @Get('download/:exportId')
  @ApiOperation({
    summary: 'Download route insights export',
  })
  @ApiParam({ name: 'exportId', description: 'Export ID from export response' })
  @ApiResponse({
    status: 200,
    description: 'Export file download',
  })
  @ApiResponse({ status: 404, description: 'Export not found' })
  async downloadExport(
    @Param('exportId') exportId: string,
    @Req() req: ExpressRequest & { user: { id: string } },
    @Res() res: ExpressResponse,
  ): Promise<void> {
    try {
      // Placeholder for actual download implementation
      // In production, fetch from storage/cache and stream file
      throw new NotFoundException(`Export ${exportId} not found or expired`);
    } catch (error) {
      res.status(HttpStatus.NOT_FOUND).json({
        statusCode: 404,
        message: 'Export not found or has expired',
        error: 'NotFound',
      });
    }
  }

  /**
   * GET /exporters/routes/stellar/exports
   *
   * List recent route insights exports for authenticated user
   */
  @Get('exports')
  @ApiOperation({
    summary: 'List user route insights exports',
  })
  @ApiResponse({
    status: 200,
    description: 'List of recent exports',
    type: [RouteInsightsExportResponseDto],
  })
  async listExports(
    @Req() req: ExpressRequest & { user: { id: string } },
  ): Promise<RouteInsightsExportResponseDto[]> {
    return this.exporterService.listUserExports(req.user.id);
  }
}
