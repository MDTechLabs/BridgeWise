import { Module } from '@nestjs/common';
import { AssetDiscoveryController } from './asset-discovery.controller';
import { AssetDiscoveryService } from './asset-discovery.service';

@Module({
  controllers: [AssetDiscoveryController],
  providers: [AssetDiscoveryService],
  exports: [AssetDiscoveryService],
})
export class AssetDiscoveryModule {}
