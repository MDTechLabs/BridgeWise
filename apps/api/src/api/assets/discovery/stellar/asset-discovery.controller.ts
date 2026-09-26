import { Controller, Get, Query, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AssetDiscoveryService } from './asset-discovery.service';
import { StellarAsset } from './asset-discovery.types';

@ApiTags('Asset Discovery')
@Controller('assets/discovery/stellar')
export class AssetDiscoveryController {
  constructor(private readonly assetDiscoveryService: AssetDiscoveryService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List supported Stellar assets' })
  @ApiResponse({ status: 200, description: 'Returns all supported Stellar assets with metadata' })
  list(): StellarAsset[] {
    return this.assetDiscoveryService.list();
  }

  @Get('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search supported Stellar assets' })
  @ApiQuery({ name: 'q', type: 'string', description: 'Search by symbol, name, or issuer', required: true })
  @ApiResponse({ status: 200, description: 'Returns matching Stellar assets' })
  search(@Query('q') query: string): StellarAsset[] {
    if (!query?.trim()) {
      throw new BadRequestException('Query parameter "q" is required');
    }
    return this.assetDiscoveryService.search(query.trim());
  }
}
