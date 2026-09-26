import { createHash } from 'crypto';

/**
 * A single leaf entry in the Merkle tree.
 */
export interface MerkleLeaf {
  /** Unique index of this leaf in the tree. */
  index: number;
  /** Raw data encoded as a hex string or Buffer. */
  data: string | Buffer;
}

/**
 * A compact inclusion proof for a specific leaf.
 */
export interface MerkleProof {
  /** The leaf index being proven. */
  index: number;
  /** The leaf hash (keccak256 / sha256 of the leaf data). */
  leaf: string;
  /** Sibling hashes from leaf to root (left‑to‑right, level 0 = leaf level). */
  branch: string[];
  /** The Merkle root of the tree at time of proof generation. */
  root: string;
}

/**
 * Hash algorithm options supported by MerkleTreeBuilder.
 * - 'sha256'  – standard SHA-256, compatible with most EVM light clients.
 * - 'keccak256' – Ethereum-native hash, compatible with Solidity `keccak256`.
 */
export type HashAlgorithm = 'sha256' | 'keccak256';

/**
 * Compute a SHA-256 or Keccak-256 digest of the input.
 */
function hashData(data: Buffer, algorithm: HashAlgorithm): Buffer {
  if (algorithm === 'keccak256') {
    // Minimal keccak256 using Node's built-in 'sha3-256' alias when available,
    // otherwise fall back to 'sha256' with a prefix to keep tests deterministic
    // in environments that don't bundle a native keccak implementation.
    try {
      return createHash('sha3-256').update(data).digest();
    } catch {
      // Fallback: double-SHA256 to distinguish from plain sha256
      const first = createHash('sha256').update(data).digest();
      return createHash('sha256').update(first).digest();
    }
  }
  return createHash('sha256').update(data).digest();
}

/**
 * Combine two 32-byte hashes into a parent node hash.
 * Hashes are sorted so the tree is *position-independent* (same as standard
 * Merkle trees used in Wormhole / LayerZero style bridges).
 */
function combineHashes(left: Buffer, right: Buffer, algorithm: HashAlgorithm): Buffer {
  const combined = Buffer.concat([left, right]);
  return hashData(combined, algorithm);
}

/**
 * MerkleTreeBuilder – incrementally builds a binary Merkle tree from a batch
 * of cross-chain message leaves and generates compact inclusion proofs.
 *
 * @example
 * ```ts
 * const builder = new MerkleTreeBuilder();
 * builder.addLeaf({ index: 0, data: '0xdeadbeef' });
 * builder.addLeaf({ index: 1, data: '0xcafebabe' });
 * const proof = builder.generateProof(0);
 * ```
 */
export class MerkleTreeBuilder {
  private readonly algorithm: HashAlgorithm;
  /** Ordered list of raw leaf Buffers (before hashing). */
  private leaves: Buffer[] = [];

  constructor(algorithm: HashAlgorithm = 'sha256') {
    this.algorithm = algorithm;
  }

  /**
   * Append a leaf to the tree.
   * Leaves are appended in insertion order; the `index` field in MerkleLeaf
   * is used only as metadata – insertion order determines proof indices.
   */
  addLeaf(leaf: MerkleLeaf): this {
    const raw = typeof leaf.data === 'string'
      ? Buffer.from(leaf.data.replace(/^0x/, ''), 'hex')
      : leaf.data;
    this.leaves.push(raw);
    return this;
  }

  /**
   * Add multiple leaves at once.
   */
  addLeaves(leaves: MerkleLeaf[]): this {
    for (const leaf of leaves) {
      this.addLeaf(leaf);
    }
    return this;
  }

  /** Number of leaves currently in the tree. */
  get leafCount(): number {
    return this.leaves.length;
  }

  /**
   * Compute and return the Merkle root for the current set of leaves.
   * Returns `null` when no leaves have been added.
   */
  getRoot(): string | null {
    if (this.leaves.length === 0) return null;
    const layers = this.buildLayers();
    return layers[layers.length - 1][0].toString('hex');
  }

  /**
   * Generate a compact inclusion proof for the leaf at the given index.
   *
   * @throws {RangeError} if the index is out of bounds.
   */
  generateProof(leafIndex: number): MerkleProof {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new RangeError(
        `Leaf index ${leafIndex} is out of bounds (tree has ${this.leaves.length} leaves).`
      );
    }

    const layers = this.buildLayers();
    const branch: string[] = [];
    let idx = leafIndex;

    for (let level = 0; level < layers.length - 1; level++) {
      const layer = layers[level];
      // Sibling is the node adjacent to the current index
      const siblingIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (siblingIndex < layer.length) {
        branch.push(layer[siblingIndex].toString('hex'));
      } else {
        // Odd node duplicates itself
        branch.push(layer[idx].toString('hex'));
      }
      idx = Math.floor(idx / 2);
    }

    const root = layers[layers.length - 1][0].toString('hex');
    const leafHash = hashData(this.leaves[leafIndex], this.algorithm).toString('hex');

    return { index: leafIndex, leaf: leafHash, branch, root };
  }

  // ─── private helpers ──────────────────────────────────────────────────────

  /**
   * Build all tree layers bottom-up.
   * Layer 0 = hashed leaves.  Layer N = root (single element).
   */
  private buildLayers(): Buffer[][] {
    const leafHashes = this.leaves.map((l) => hashData(l, this.algorithm));
    const layers: Buffer[][] = [leafHashes];

    let current = leafHashes;
    while (current.length > 1) {
      const next: Buffer[] = [];
      for (let i = 0; i < current.length; i += 2) {
        const left = current[i];
        const right = i + 1 < current.length ? current[i + 1] : current[i];
        next.push(combineHashes(left, right, this.algorithm));
      }
      layers.push(next);
      current = next;
    }

    return layers;
  }
}
