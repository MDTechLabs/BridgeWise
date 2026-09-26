import { Module } from '@nestjs/common';
import { AssetCoverageController } from './asset-coverage.controller';
import { AssetCoverageService } from './asset-coverage.service';

@Module({
  controllers: [AssetCoverageController],
  providers: [AssetCoverageService],
})
export class AssetCoverageModule {}