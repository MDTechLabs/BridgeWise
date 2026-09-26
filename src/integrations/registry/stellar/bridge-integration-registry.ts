import {
  BridgeIntegration,
  IntegrationDiscoveryRequest,
  IntegrationRegistryStats,
} from './bridge-integration-registry.types';

export class BridgeIntegrationNotFoundError extends Error {
  constructor(id: string) {
    super(`Bridge integration not found: "${id}"`);
    this.name = 'BridgeIntegrationNotFoundError';
  }
}

export class BridgeIntegrationRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BridgeIntegrationRegistrationError';
  }
}

export class BridgeIntegrationRegistry {
  private readonly integrations: Map<string, BridgeIntegration> = new Map();

  register(integration: BridgeIntegration): void {
    this.validate(integration);
    const key = integration.id.toLowerCase();
    this.integrations.set(key, { ...integration, id: key });
  }

  registerBatch(integrations: BridgeIntegration[]): void {
    for (const integration of integrations) this.validate(integration);
    for (const integration of integrations) this.register(integration);
  }

  deregister(id: string): boolean {
    return this.integrations.delete(id.toLowerCase());
  }

  get(id: string): BridgeIntegration | undefined {
    return this.integrations.get(id.toLowerCase());
  }

  getOrThrow(id: string): BridgeIntegration {
    const integration = this.get(id);
    if (!integration) throw new BridgeIntegrationNotFoundError(id);
    return integration;
  }

  getAll(): BridgeIntegration[] {
    return Array.from(this.integrations.values());
  }

  discover(request: IntegrationDiscoveryRequest): BridgeIntegration[] {
    return this.getAll().filter((i) => {
      if (request.chain && !i.chains.includes(request.chain)) return false;
      if (request.asset && !i.assets.includes(request.asset)) return false;
      if (request.status && i.status !== request.status) return false;
      return true;
    });
  }

  getByProvider(provider: string): BridgeIntegration[] {
    return this.getAll().filter(
      (i) => i.provider.toLowerCase() === provider.toLowerCase(),
    );
  }

  stats(): IntegrationRegistryStats {
    const all = this.getAll();
    const chains = new Set<string>();
    const providers = new Set<string>();
    for (const i of all) {
      for (const c of i.chains) chains.add(c);
      providers.add(i.provider);
    }
    return {
      totalIntegrations: all.length,
      activeIntegrations: all.filter((i) => i.status === 'active').length,
      supportedChains: [...chains].sort(),
      providers: [...providers].sort(),
    };
  }

  private validate(integration: BridgeIntegration): void {
    if (!integration.id?.trim()) {
      throw new BridgeIntegrationRegistrationError(
        'Integration id must be a non-empty string',
      );
    }
    if (!integration.name?.trim()) {
      throw new BridgeIntegrationRegistrationError(
        `Integration "${integration.id}": name must be a non-empty string`,
      );
    }
    if (!integration.provider?.trim()) {
      throw new BridgeIntegrationRegistrationError(
        `Integration "${integration.id}": provider must be a non-empty string`,
      );
    }
    if (!Array.isArray(integration.chains) || integration.chains.length === 0) {
      throw new BridgeIntegrationRegistrationError(
        `Integration "${integration.id}": must support at least one chain`,
      );
    }
    if (!Array.isArray(integration.assets) || integration.assets.length === 0) {
      throw new BridgeIntegrationRegistrationError(
        `Integration "${integration.id}": must support at least one asset`,
      );
    }
  }
}

export const defaultBridgeIntegrationRegistry = new BridgeIntegrationRegistry();

defaultBridgeIntegrationRegistry.registerBatch([
  {
    id: 'allbridge-stellar-eth',
    name: 'AllBridge Stellar-Ethereum',
    provider: 'AllBridge',
    version: '2.1.0',
    chains: ['Stellar', 'Ethereum'],
    assets: ['USDC', 'USDT', 'ETH'],
    status: 'active',
    metadata: { docs: 'https://docs.allbridge.io' },
    registeredAt: new Date().toISOString(),
  },
  {
    id: 'squid-stellar-polygon',
    name: 'Squid Router Stellar-Polygon',
    provider: 'Squid',
    version: '1.4.2',
    chains: ['Stellar', 'Polygon'],
    assets: ['USDC', 'USDT'],
    status: 'active',
    metadata: { docs: 'https://docs.squidrouter.com' },
    registeredAt: new Date().toISOString(),
  },
  {
    id: 'stargate-stellar-base',
    name: 'Stargate Stellar-Base',
    provider: 'Stargate',
    version: '1.0.0',
    chains: ['Stellar', 'Base'],
    assets: ['USDC', 'XLM'],
    status: 'beta',
    metadata: { docs: 'https://stargate.finance' },
    registeredAt: new Date().toISOString(),
  },
  {
    id: 'wormhole-stellar-eth',
    name: 'Wormhole Stellar-Ethereum',
    provider: 'Wormhole',
    version: '3.0.1',
    chains: ['Stellar', 'Ethereum', 'Solana'],
    assets: ['USDC', 'SOL', 'ETH'],
    status: 'active',
    metadata: { docs: 'https://docs.wormhole.com' },
    registeredAt: new Date().toISOString(),
  },
]);
