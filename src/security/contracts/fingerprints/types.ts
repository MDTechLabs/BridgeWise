/**
 * Soroban deployment fingerprinting types.
 *
 * A fingerprint answers one question: is the contract we are talking to right
 * now the same deployment we approved? It therefore covers only the fields
 * that define a deployment's identity — never when or how we observed it.
 */

/** Stellar network a deployment lives on. */
export enum FingerprintNetwork {
  TESTNET = 'testnet',
  PUBLIC = 'public',
  FUTURENET = 'futurenet',
  STANDALONE = 'standalone',
}

/**
 * The interface surface of a deployment.
 *
 * Function entries are canonical signatures (`transfer(from:address,to:address,amount:i128):bool`)
 * rather than bare names, so a changed parameter list is visible in the digest.
 */
export interface ContractInterfaceSurface {
  functions: string[];
  events: string[];
  errors: number[];
}

/** A deployment as observed on-chain or read from a registry. */
export interface DeploymentObservation {
  contractAddress: string;
  network: FingerprintNetwork;
  /** Hex hash of the deployed wasm. */
  wasmHash: string;
  specVersion?: string;
  interface?: ContractInterfaceSurface;
  /** Observation-time context. Deliberately excluded from the fingerprint. */
  observedAt?: number;
  deployedAt?: number;
  deployerAddress?: string;
  txHash?: string;
}

/** Deterministic identity of a deployment. */
export interface DeploymentFingerprint {
  /** sha256 over the canonical identity payload, hex encoded. */
  fingerprint: string;
  contractAddress: string;
  network: FingerprintNetwork;
  wasmHash: string;
  specVersion?: string;
  /** sha256 over the canonical interface surface. */
  interfaceDigest: string;
  computedAt: number;
}

/** An operator-approved deployment. */
export interface ApprovedFingerprint {
  fingerprint: string;
  contractAddress: string;
  network: FingerprintNetwork;
  /** Full detail of what was approved, so a mismatch can say what differs. */
  details: DeploymentFingerprint;
  label?: string;
  approvedAt: number;
  approvedBy?: string;
  notes?: string;
  revokedAt?: number;
  revokedReason?: string;
}

export interface ApproveFingerprintInput {
  details: DeploymentFingerprint;
  label?: string;
  approvedBy?: string;
  notes?: string;
  approvedAt?: number;
}

export enum VerificationStatus {
  /** Matches an active approved fingerprint. */
  APPROVED = 'approved',
  /** The contract has approvals, but this deployment is not one of them. */
  MISMATCH = 'mismatch',
  /** Matches an approval that has since been revoked. */
  REVOKED = 'revoked',
  /** Nothing has ever been approved for this contract on this network. */
  UNKNOWN = 'unknown',
}

export enum MismatchReason {
  WASM_HASH_CHANGED = 'wasm_hash_changed',
  INTERFACE_CHANGED = 'interface_changed',
  SPEC_VERSION_CHANGED = 'spec_version_changed',
  NO_APPROVED_FINGERPRINT = 'no_approved_fingerprint',
  FINGERPRINT_REVOKED = 'fingerprint_revoked',
}

export interface VerificationResult {
  contractAddress: string;
  network: FingerprintNetwork;
  status: VerificationStatus;
  observed: DeploymentFingerprint;
  /** The approval this deployment matched, when it matched one. */
  matched?: ApprovedFingerprint;
  /** The approval a mismatch was compared against — the most recent active one. */
  comparedAgainst?: ApprovedFingerprint;
  reasons: MismatchReason[];
  /** Human-readable differences, for logs and alerts. */
  differences: string[];
  verifiedAt: number;
}

export const EMPTY_INTERFACE: ContractInterfaceSurface = {
  functions: [],
  events: [],
  errors: [],
};
