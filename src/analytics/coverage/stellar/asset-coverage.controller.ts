import { Controller, Get } from '@nestjs/common';
import { AssetCoverageService } from './asset-coverage.service';
import { CoverageReport } from './asset-coverage.types';

@Controller('coverage/stellar')
export class AssetCoverageController {
  constructor(private readonly coverageService: AssetCoverageService) {}

  @Get()
  async getCoverageReport(): Promise<CoverageReport> {
    return this.coverageService.getCoverageReport();
  }
}