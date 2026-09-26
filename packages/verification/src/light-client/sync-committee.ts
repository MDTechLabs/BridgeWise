/**
 * Sync committee verifier for light-client-based cross-chain bridges.
 *
 * Handles BLS aggregate signature verification structure, sync committee
 * quorum checks, and committee period validation. The actual BLS pairing
 * verification is designed as a pluggable interface — in production this
 * would delegate to a library such as `@chainsafe/blst`.
 *
 * @example
 * ```ts
 * const verifier = new SyncCommitteeVerifier();
 * const isValid = verifier.verifySignature(header, blsSignature);
 * const quorumOk = verifier.verifyQuorum(blsSignature);
 * ```
 */

import { BLSSignature, BlockHeader, LightClientConfig } from "./types";

const DEFAULT_CONFIG: Required<LightClientConfig> = {
  expectedCommitteeSize: 512,
  quorumThreshold: 2 / 3,
};

const SLOTS_PER_PERIOD = 8192;

/**
 * Verifies sync committee signatures and quorum for light client headers.
 */
export class SyncCommitteeVerifier {
  private readonly config: Required<LightClientConfig>;

  constructor(config: LightClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Verify the structure of a BLS aggregate signature against a sync committee.
   *
   * In production, this would use a BLS library to verify the aggregate
   * signature against the aggregate public key. This implementation validates
   * the structural integrity of the signature data.
   */
  verifySignature(header: BlockHeader, blsSignature: BLSSignature): boolean {
    if (!blsSignature.signature || blsSignature.signature.length < 10) {
      return false;
    }

    if (!blsSignature.signature.startsWith("0x")) {
      return false;
    }

    if (!blsSignature.committee.aggregatePubkey || blsSignature.committee.aggregatePubkey.length < 10) {
      return false;
    }

    if (!blsSignature.committee.aggregatePubkey.startsWith("0x")) {
      return false;
    }

    if (blsSignature.slot !== header.slot) {
      return false;
    }

    if (blsSignature.committee.pubkeys.length !== this.config.expectedCommitteeSize) {
      return false;
    }

    return true;
  }

  /**
   * Verify that enough sync committee members participated in the signature
   * to meet the quorum threshold (default: 2/3).
   */
  verifyQuorum(blsSignature: BLSSignature): boolean {
    const participants = this.countBits(blsSignature.committee.participantsBits);
    const totalValidators = blsSignature.committee.pubkeys.length;

    if (totalValidators === 0) {
      return false;
    }

    const participationRatio = participants / totalValidators;
    return participationRatio >= this.config.quorumThreshold;
  }

  /**
   * Count the number of participating validators from the participants bits.
   */
  countParticipants(participantsBits: string): number {
    return this.countBits(participantsBits);
  }

  /**
   * Verify that the sync committee period aligns with the block slot.
   */
  verifyCommitteePeriod(blsSignature: BLSSignature): boolean {
    const expectedPeriod = Math.floor(blsSignature.slot / SLOTS_PER_PERIOD);
    return blsSignature.committee.period === expectedPeriod;
  }

  /**
   * Count 1-bits in a bitstring.
   */
  private countBits(bitstring: string): number {
    let count = 0;
    for (const char of bitstring) {
      if (char === "1") {
        count++;
      }
    }
    return count;
  }
}
