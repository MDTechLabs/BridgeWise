import { Controller, Get, Param, Post } from '@nestjs/common';
import { StellarProviderDiscoveryService } from './stellar-provider-discovery.service';
import { StellarProviderMetadata } from './stellar-provider-discovery.types';

@Controller('providers/stellar')
export class StellarProviderDiscoveryController {
  constructor(
    private readonly discoveryService: StellarProviderDiscoveryService,
  ) {}

  @Get()
  async getAllProviders(): Promise<StellarProviderMetadata[]> {
    return this.discoveryService.getAll();
  }

  @Get(':id')
  async getProviderById(
    @Param('id') id: string,
  ): Promise<StellarProviderMetadata> {
    const provider = this.discoveryService.get(id);
    if (!provider) {
      // In a real application, you'd throw a NotFoundException here
      throw new Error('Provider not found');
    }
    return provider;
  }
}