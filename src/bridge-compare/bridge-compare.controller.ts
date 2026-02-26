import {
  Controller,
  Get,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  UseFilters,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { BridgeCompareService } from './bridge-compare.service';
import { GetQuotesDto } from './dto';
import { QuoteResponse, NormalizedQuote } from './interfaces';

@ApiTags('bridge-compare')
@Controller('bridge-compare')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class BridgeCompareController {
  constructor(private readonly bridgeCompareService: BridgeCompareService) {}

  @Get('quotes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fetch ranked bridge quotes',
    description:
      'Returns normalized, ranked quotes from all supported bridge providers for the requested route.',
  })
  @ApiResponse({ status: 200, description: 'Ranked quotes returned successfully' })
  @ApiBadRequestResponse({ description: 'Invalid request parameters' })
  @ApiNotFoundResponse({ description: 'No routes found for the token pair' })
  @ApiServiceUnavailableResponse({ description: 'All bridge providers unavailable' })
  async getQuotes(@Query() dto: GetQuotesDto): Promise<QuoteResponse> {
    return this.bridgeCompareService.getQuotes(dto);
  }

  @Get('quotes/:bridgeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get specific bridge route details',
    description: 'Returns the full normalized quote for a specific bridge provider.',
  })
  @ApiParam({ name: 'bridgeId', description: 'Bridge provider identifier', example: 'stargate' })
  @ApiResponse({ status: 200, description: 'Route details returned' })
  @ApiNotFoundResponse({ description: 'Route not found' })
  async getRouteDetails(
    @Param('bridgeId') bridgeId: string,
    @Query() dto: GetQuotesDto,
  ): Promise<NormalizedQuote> {
    return this.bridgeCompareService.getRouteDetails(dto, bridgeId);
  }

  @Get('providers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all supported bridge providers',
    description: 'Returns all configured bridge providers with their supported chains and tokens.',
  })
  @ApiResponse({ status: 200, description: 'Providers listed successfully' })
  getSupportedBridges() {
    return this.bridgeCompareService.getSupportedBridges();
  }
}
