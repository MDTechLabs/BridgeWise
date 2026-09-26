/**
 * Types for the on-chain light client header and state verification engine.
 *
 * @example
 * ```ts
 * import type { BlockHeader, SyncCommittee, StateProof } from '@bridgewise/verification';
 * ```
 */

/**
 * A block header from a beacon chain (e.g. Ethereum consensus layer).
 */
export interface BlockHeader {
  /** Beacon chain slot number. */
  slot: number;
  /** Index of the block proposer within the validator set. */
  proposerIndex: number;
  /** Hash of the parent block header (0x-prefixed hex). */
  parentRoot: string;
  /** State root after applying this block (0x-prefixed hex). */
  stateRoot: string;
  /** Hash of the entire block body (0x-prefixed hex). */
  bodyRoot: string;
  /** BLS signature over the block by the proposer (0x-prefixed hex). */
  signature: string;
}

/**
 * A sync committee responsible for attesting to block headers.
 */
export interface SyncCommittee {
  /** List of BLS public keys for all committee members (0x-prefixed hex). */
  pubkeys: string[];
  /** Aggregate BLS public key for the entire committee (0x-prefixed hex). */
  aggregatePubkey: string;
  /** Sync committee period number. */
  period: number;
  /** Bitstring indicating which committee members participated in the signature. */
  participantsBits: string;
}

/**
 * A BLS aggregate signature produced by a sync committee.
 */
export interface BLSSignature {
  /** The aggregate BLS signature bytes (0x-prefixed hex). */
  signature: string;
  /** The sync committee that produced this signature. */
  committee: SyncCommittee;
  /** The slot this signature attests to. */
  slot: number;
}

/**
 * A verifiable state proof for use in downstream contract invocation checks.
 */
export interface StateProof {
  /** The verified state root. */
  stateRoot: string;
  /** Slot number the proof is for. */
  slot: number;
  /** Number of validators that participated in signing. */
  quorumVotes: number;
  /** Total validators in the sync committee. */
  totalValidators: number;
  /** Whether the proof meets validity criteria. */
  isValid: boolean;
  /** Unix timestamp (ms) when the proof was generated. */
  verifiedAt: number;
}

/**
 * Result of a block header verification operation.
 */
export interface HeaderVerificationResult {
  /** Whether the header passed all validation checks. */
  isValid: boolean;
  /** The slot number of the verified header. */
  slot: number;
  /** The state root from the verified header. */
  stateRoot: string;
  /** The parent root from the verified header. */
  parentRoot: string;
  /** List of validation error messages (empty if valid). */
  errors: string[];
  /** Verifiable state proof if validation succeeded. */
  stateProof?: StateProof;
}

/**
 * Configuration options for the light client verifier.
 */
export interface LightClientConfig {
  /** Expected number of validators in the sync committee (default: 512). */
  expectedCommitteeSize?: number;
  /** Minimum fraction of the committee that must sign (default: 0.6667 = 2/3). */
  quorumThreshold?: number;
}
