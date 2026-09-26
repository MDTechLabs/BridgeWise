export interface BridgeIntegration {
  id: string;
  name: string;
  provider: string;
  version: string;
  chains: string[];
  assets: string[];
  status: 'active' | 'deprecated' | 'beta';
  metadata: Record<string, string>;
  registeredAt: string;
}

export interface IntegrationDiscoveryRequest {
  chain?: string;
  asset?: string;
  status?: 'active' | 'deprecated' | 'beta';
}

export interface IntegrationRegistryStats {
  totalIntegrations: number;
  activeIntegrations: number;
  supportedChains: string[];
  providers: string[];
}
