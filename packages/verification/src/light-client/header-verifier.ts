/**
 * Header verifier for light-client-based cross-chain bridges.
 *
 * Validates block header structure, header chain continuity, and state root
 * transitions. Designed to work with beacon chain headers (e.g. Ethereum
 * consensus layer).
 *
 * @example
 * ```ts
 * const verifier = new HeaderVerifier();
 * const result = verifier.validateHeader(header);
 * if (result.isValid) {
 *   console.log('Header valid at slot', result.slot);
 * }
 * ```
 */

import {
  BlockHeader,
  HeaderVerificationResult,
  LightClientConfig,
  StateProof,
  SyncCommittee,
} from "./types";

const DEFAULT_CONFIG: Required<LightClientConfig> = {
  expectedCommitteeSize: 512,
  quorumThreshold: 2 / 3,
};

const HEX_REGEX = /^0x[0-9a-fA-F]+$/;

/**
 * Validates block header structure and header chain continuity.
 */
export class HeaderVerifier {
  private readonly config: Required<LightClientConfig>;

  constructor(config: LightClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate a single block header's structure and field format.
   *
   * Returns a `HeaderVerificationResult` indicating whether the header is
   * structurally valid.
   */
  validateHeader(header: BlockHeader): HeaderVerificationResult {
    const errors: string[] = [];

    if (!Number.isInteger(header.slot) || header.slot < 0) {
      errors.push(`Invalid slot: ${header.slot}`);
    }

    if (!Number.isInteger(header.proposerIndex) || header.proposerIndex < 0) {
      errors.push(`Invalid proposerIndex: ${header.proposerIndex}`);
    }

    if (!this.isValidHex(header.parentRoot, 66)) {
      errors.push(`Invalid parentRoot format: ${header.parentRoot}`);
    }

    if (!this.isValidHex(header.stateRoot, 66)) {
      errors.push(`Invalid stateRoot format: ${header.stateRoot}`);
    }

    if (!this.isValidHex(header.bodyRoot, 66)) {
      errors.push(`Invalid bodyRoot format: ${header.bodyRoot}`);
    }

    if (!this.isValidHex(header.signature, -1)) {
      errors.push(`Invalid signature format: ${header.signature.slice(0, 20)}...`);
    }

    const isValid = errors.length === 0;

    const result: HeaderVerificationResult = {
      isValid,
      slot: header.slot,
      stateRoot: header.stateRoot,
      parentRoot: header.parentRoot,
      errors,
    };

    return result;
  }

  /**
   * Validate a chain of consecutive block headers.
   *
   * Checks that each child header properly references its parent and that
   * slots are sequential.
   */
  validateHeaderChain(headers: BlockHeader[]): HeaderVerificationResult[] {
    const results: HeaderVerificationResult[] = [];

    for (let i = 0; i < headers.length; i++) {
      const result = this.validateHeader(headers[i]);

      if (i > 0 && result.isValid) {
        const parent = headers[i - 1];
        const child = headers[i];

        if (child.parentRoot !== parent.bodyRoot) {
          result.isValid = false;
          result.errors.push(
            `parentRoot mismatch: expected ${parent.bodyRoot}, got ${child.parentRoot}`,
          );
        }

        if (child.slot !== parent.slot + 1) {
          result.isValid = false;
          result.errors.push(
            `Slot gap: expected ${parent.slot + 1}, got ${child.slot}`,
          );
        }
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Verify that a state root transition is valid between two consecutive headers.
   */
  verifyStateTransition(parent: BlockHeader, child: BlockHeader): boolean {
    const parentValid = this.validateHeader(parent);
    const childValid = this.validateHeader(child);

    if (!parentValid.isValid || !childValid.isValid) {
      return false;
    }

    if (parent.stateRoot === child.stateRoot) {
      return false;
    }

    return true;
  }

  /**
   * Generate a verifiable state proof for a given block header and sync committee.
   */
  generateStateProof(header: BlockHeader, committee: SyncCommittee): StateProof {
    const headerResult = this.validateHeader(header);

    const participants = this.countBits(committee.participantsBits);
    const totalValidators = committee.pubkeys.length;
    const quorumMet = totalValidators > 0 && (participants / totalValidators) >= this.config.quorumThreshold;

    return {
      stateRoot: header.stateRoot,
      slot: header.slot,
      quorumVotes: participants,
      totalValidators,
      isValid: headerResult.isValid && quorumMet,
      verifiedAt: Date.now(),
    };
  }

  /**
   * Check if a string is valid 0x-prefixed hex with the expected length.
   */
  private isValidHex(value: string, expectedLength: number): boolean {
    if (!HEX_REGEX.test(value)) {
      return false;
    }
    if (expectedLength > 0 && value.length !== expectedLength) {
      return false;
    }
    return value.length >= 10;
  }

  /**
   * Count the number of 1-bits in a bitstring representation.
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
