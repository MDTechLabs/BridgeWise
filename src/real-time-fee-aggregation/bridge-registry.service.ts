import { Injectable, Logger } from '@nestjs/common';
import { BridgeAdapter } from '../interfaces/bridge-adapter.interface';

export const BRIDGE_ADAPTERS = 'BRIDGE_ADAPTERS';

@Injectable()
export class BridgeRegistryService {
  private readonly logger = new Logger(BridgeRegistryService.name);
  private readonly adapters: Map<string, BridgeAdapter> = new Map();

  register(adapter: BridgeAdapter): void {
    if (this.adapters.has(adapter.name)) {
      this.logger.warn(`Adapter "${adapter.name}" is already registered. Overwriting.`);
    }
    this.adapters.set(adapter.name, adapter);
    this.logger.log(`Registered bridge adapter: ${adapter.name}`);
  }

  listAdapters(): BridgeAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAdapter(name: string): BridgeAdapter | undefined {
    return this.adapters.get(name);
  }

  get count(): number {
    return this.adapters.size;
  }
}
