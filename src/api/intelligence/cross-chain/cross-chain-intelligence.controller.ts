import { Controller, Get, Query } from '@nestjs/common';
import { CrossChainIntelligenceService } from './cross-chain-intelligence.service';
import { IntelligenceFilter } from './types';

/**
 * Controller for the Soroban Cross-Chain Intelligence API (#563).
 *
 * Exposes GET endpoints for querying route, provider, and asset intelligence
 * with advanced filtering capabilities.
 */
@Controller('v1/intelligence')
export class CrossChainIntelligenceController {
  constructor(private readonly service: CrossChainIntelligenceService) {}

  @Get('routes')
  getRoutes(@Query() filter: IntelligenceFilter) {
    return this.service.getRoutes(filter);
  }

  @Get('providers')
  getProviders(@Query() filter: IntelligenceFilter) {
    return this.service.getProviders(filter);
  }

  @Get('assets')
  getAssets(@Query() filter: IntelligenceFilter) {
    return this.service.getAssets(filter);
  }
}
