import { createHash } from 'crypto';
import type { MerkleProof, HashAlgorithm } from './tree-builder';

// ─── Internal helpers (duplicated locally to keep this file self-contained) ──

function hashData(data: Buffer, algorithm: HashAlgorithm): Buffer {
  if (algorithm === 'keccak256') {
    try {
      return createHash('sha3-256').update(data).digest();
    } catch {
      const first = createHash('sha256').update(data).digest();
      return createHash('sha256').update(first).digest();
    }
  }
  return createHash('sha256').update(data).digest();
}

function combineHashes(left: Buffer, right: Buffer, algorithm: HashAlgorithm): Buffer {
  return hashData(Buffer.concat([left, right]), algorithm);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Result returned by `ProofVerifier.verify`.
 */
export interface VerificationResult {
  /** Whether the proof is valid against the provided root. */
  valid: boolean;
  /** Human-readable explanation when `valid` is false. */
  reason?: string;
  /** The recomputed root (useful for debugging). */
  computedRoot: string;
}

/**
 * ProofVerifier – stateless helper that verifies Merkle inclusion proofs.
 *
 * Compatible with proofs produced by `MerkleTreeBuilder` and designed to
 * mirror verification logic that can be implemented in Solidity (`keccak256`)
 * or Rust/Soroban (`sha256`).
 *
 * @example
 * ```ts
 * const verifier = new ProofVerifier('sha256');
 * const result   = verifier.verify(proof, expectedRoot);
 * if (!result.valid) console.error(result.reason);
 * ```
 */
export class ProofVerifier {
  private readonly algorithm: HashAlgorithm;

  constructor(algorithm: HashAlgorithm = 'sha256') {
    this.algorithm = algorithm;
  }

  /**
   * Verify a `MerkleProof` against the given `expectedRoot`.
   *
   * @param proof        - The inclusion proof to verify.
   * @param expectedRoot - Hex-encoded expected Merkle root (optional; falls
   *                       back to `proof.root` when omitted).
   */
  verify(proof: MerkleProof, expectedRoot?: string): VerificationResult {
    const target = expectedRoot ?? proof.root;

    // Basic structural validation
    if (!proof.leaf || typeof proof.leaf !== 'string') {
      return {
        valid: false,
        reason: 'Proof is missing or has an invalid leaf hash.',
        computedRoot: '',
      };
    }
    if (!Array.isArray(proof.branch)) {
      return {
        valid: false,
        reason: 'Proof branch must be an array.',
        computedRoot: '',
      };
    }

    let current: Buffer;
    try {
      current = Buffer.from(proof.leaf, 'hex');
    } catch {
      return { valid: false, reason: 'Leaf hash is not valid hex.', computedRoot: '' };
    }

    let idx = proof.index;

    for (let i = 0; i < proof.branch.length; i++) {
      let sibling: Buffer;
      try {
        sibling = Buffer.from(proof.branch[i], 'hex');
      } catch {
        return {
          valid: false,
          reason: `Branch node at position ${i} is not valid hex.`,
          computedRoot: '',
        };
      }

      if (idx % 2 === 0) {
        // Current node is a left child
        current = combineHashes(current, sibling, this.algorithm);
      } else {
        // Current node is a right child
        current = combineHashes(sibling, current, this.algorithm);
      }
      idx = Math.floor(idx / 2);
    }

    const computedRoot = current.toString('hex');
    const valid = computedRoot === target;

    return {
      valid,
      computedRoot,
      reason: valid ? undefined : `Root mismatch: expected ${target}, got ${computedRoot}.`,
    };
  }

  /**
   * Convenience static method – verify without instantiating a class.
   */
  static verifyProof(
    proof: MerkleProof,
    expectedRoot?: string,
    algorithm: HashAlgorithm = 'sha256'
  ): VerificationResult {
    return new ProofVerifier(algorithm).verify(proof, expectedRoot);
  }

  /**
   * Verify that a raw leaf value (before hashing) is included in the tree.
   * This hashes `rawLeaf` with the configured algorithm and then calls
   * `verify` – useful when callers only have the raw data, not the leaf hash.
   *
   * @param rawLeaf  - Hex-encoded or Buffer raw leaf data.
   * @param proof    - Proof produced by MerkleTreeBuilder (branch + index + root).
   * @param expectedRoot - Optional override root to check against.
   */
  verifyRawLeaf(
    rawLeaf: string | Buffer,
    proof: MerkleProof,
    expectedRoot?: string
  ): VerificationResult {
    const data =
      typeof rawLeaf === 'string' ? Buffer.from(rawLeaf.replace(/^0x/, ''), 'hex') : rawLeaf;

    const leafHash = hashData(data, this.algorithm).toString('hex');

    // Replace proof.leaf with our freshly computed hash for the check
    const adjustedProof: MerkleProof = { ...proof, leaf: leafHash };
    return this.verify(adjustedProof, expectedRoot);
  }
}
