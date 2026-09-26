/**
 * Soroban contract upgrade detection types.
 *
 * An upgrade is not inherently a problem — it is a withdrawal of the evidence
 * that made the contract trusted. These types describe what changed, how
 * badly, and which BridgeWise integrations relied on the old behaviour.
 */

import {
  ContractInterfaceSurface,
  DeploymentFingerprint,
  DeploymentObservation,
  FingerprintNetwork,
} from '../../fingerprints/types';

export enum UpgradeIndicator {
  /** New code behind the same address. */
  WASM_HASH_CHANGED = 'wasm_hash_changed',
  SPEC_VERSION_CHANGED = 'spec_version_changed',
  INTERFACE_FUNCTIONS_ADDED = 'interface_functions_added',
  INTERFACE_FUNCTIONS_REMOVED = 'interface_functions_removed',
  INTERFACE_EVENTS_CHANGED = 'interface_events_changed',
  INTERFACE_ERRORS_CHANGED = 'interface_errors_changed',
  /** Same code, new deployment transaction. */
  REDEPLOYED = 'redeployed',
}

export enum UpgradeSeverity {
  INFO = 'info',
  MINOR = 'minor',
  MAJOR = 'major',
  CRITICAL = 'critical',
}

export interface TrackedContractState {
  contractAddress: string;
  network: FingerprintNetwork;
  fingerprint: DeploymentFingerprint;
  /** Last observed interface surface, kept so a diff can name the functions. */
  interfaceSurface?: ContractInterfaceSurface;
  /** Integration ids that depend on this contract. */
  integrations: string[];
  label?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastTxHash?: string;
  upgradeCount: number;
}

export interface UpgradeEvent {
  id: string;
  contractAddress: string;
  network: FingerprintNetwork;
  previousFingerprint: DeploymentFingerprint;
  currentFingerprint: DeploymentFingerprint;
  indicators: UpgradeIndicator[];
  severity: UpgradeSeverity;
  /** Human-readable summary lines, one per indicator. */
  details: string[];
  addedFunctions: string[];
  removedFunctions: string[];
  affectedIntegrations: string[];
  detectedAt: number;
  txHash?: string;
}

export interface IntegrationReviewFlag {
  integrationId: string;
  contractAddress: string;
  network: FingerprintNetwork;
  upgradeEventId: string;
  severity: UpgradeSeverity;
  reason: string;
  flaggedAt: number;
  clearedAt?: number;
  clearedBy?: string;
}

export interface RegisterContractInput {
  contractAddress: string;
  network: FingerprintNetwork;
  integrations?: string[];
  label?: string;
  /** Known-good baseline, so the first observation can already be judged. */
  baseline?: DeploymentObservation;
}

export interface UpgradeDetectorConfig {
  /** Cap on retained upgrade events. Default 500. */
  maxHistory?: number;
  /**
   * Treat a redeploy of identical code as an upgrade. Default true: the
   * address' code is unchanged but its storage and admin may not be.
   */
  treatRedeployAsUpgrade?: boolean;
}
