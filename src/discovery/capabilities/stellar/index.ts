export { StellarProviderCapabilityDiscoveryService } from './capability-discovery.service';
export type {
  ProviderCapability,
  CapabilityCategory,
  CapabilityRecord,
  ProviderCapabilityProfile,
  CapabilitySummary,
  CapabilityDiscoveryConfig,
  CapabilityDiscoveryResult,
  CapabilityValidationResult,
  CapabilityDetector,
  CapabilityValidator,
} from './types';
export { STELLAR_PROVIDER_CAPABILITIES } from './types';

import { StellarProviderCapabilityDiscoveryService } from './capability-discovery.service';

/** Pre-configured capability discovery service instance. */
export const stellarProviderCapabilityDiscoveryService =
  new StellarProviderCapabilityDiscoveryService();
