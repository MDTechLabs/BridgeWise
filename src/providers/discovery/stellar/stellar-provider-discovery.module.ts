import { Module } from '@nestjs/common';
import { StellarProviderDiscoveryController } from './stellar-provider-discovery.controller';
import { StellarProviderDiscoveryService } from './stellar-provider-discovery.service';

@Module({
  controllers: [StellarProviderDiscoveryController],
  providers: [StellarProviderDiscoveryService],
})
export class StellarProviderDiscoveryModule {}