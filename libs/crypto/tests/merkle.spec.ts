import { MerkleTreeBuilder } from '../src/merkle/tree-builder';
import { ProofVerifier } from '../src/merkle/proof-verifier';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hex(s: string): string {
  return Buffer.from(s, 'utf8').toString('hex');
}

// ─── MerkleTreeBuilder ────────────────────────────────────────────────────────

describe('MerkleTreeBuilder', () => {
  it('returns null root when no leaves have been added', () => {
    const builder = new MerkleTreeBuilder();
    expect(builder.getRoot()).toBeNull();
  });

  it('returns a non-empty root for a single leaf', () => {
    const builder = new MerkleTreeBuilder();
    builder.addLeaf({ index: 0, data: hex('msg-0') });
    const root = builder.getRoot();
    expect(root).toBeTruthy();
    expect(typeof root).toBe('string');
  });

  it('produces a deterministic root for the same leaf set', () => {
    const build = () => {
      const b = new MerkleTreeBuilder();
      b.addLeaves([
        { index: 0, data: hex('alpha') },
        { index: 1, data: hex('beta') },
        { index: 2, data: hex('gamma') },
      ]);
      return b.getRoot();
    };
    expect(build()).toBe(build());
  });

  it('produces different roots when leaves differ', () => {
    const b1 = new MerkleTreeBuilder();
    b1.addLeaf({ index: 0, data: hex('leaf-A') });
    b1.addLeaf({ index: 1, data: hex('leaf-B') });

    const b2 = new MerkleTreeBuilder();
    b2.addLeaf({ index: 0, data: hex('leaf-A') });
    b2.addLeaf({ index: 1, data: hex('TAMPERED') }); // different leaf

    expect(b1.getRoot()).not.toBe(b2.getRoot());
  });

  it('reports the correct leaf count', () => {
    const b = new MerkleTreeBuilder();
    expect(b.leafCount).toBe(0);
    b.addLeaf({ index: 0, data: hex('x') });
    expect(b.leafCount).toBe(1);
    b.addLeaf({ index: 1, data: hex('y') });
    expect(b.leafCount).toBe(2);
  });

  it('throws RangeError when requesting proof for out-of-bounds index', () => {
    const b = new MerkleTreeBuilder();
    b.addLeaf({ index: 0, data: hex('only') });
    expect(() => b.generateProof(5)).toThrow(RangeError);
    expect(() => b.generateProof(-1)).toThrow(RangeError);
  });

  it('generates a proof with the correct structure', () => {
    const b = new MerkleTreeBuilder();
    b.addLeaves([
      { index: 0, data: hex('m0') },
      { index: 1, data: hex('m1') },
      { index: 2, data: hex('m2') },
      { index: 3, data: hex('m3') },
    ]);
    const proof = b.generateProof(1);
    expect(proof.index).toBe(1);
    expect(typeof proof.leaf).toBe('string');
    expect(Array.isArray(proof.branch)).toBe(true);
    expect(proof.branch.length).toBeGreaterThan(0);
    expect(typeof proof.root).toBe('string');
  });

  it('works with keccak256 hash algorithm', () => {
    const b = new MerkleTreeBuilder('keccak256');
    b.addLeaf({ index: 0, data: hex('keccak-leaf') });
    expect(b.getRoot()).toBeTruthy();
  });

  it('supports 0x-prefixed hex data', () => {
    const b = new MerkleTreeBuilder();
    b.addLeaf({ index: 0, data: '0xdeadbeef' });
    b.addLeaf({ index: 1, data: '0xcafebabe' });
    expect(b.getRoot()).toBeTruthy();
  });
});

// ─── ProofVerifier ────────────────────────────────────────────────────────────

describe('ProofVerifier', () => {
  function buildTree(messages: string[]) {
    const b = new MerkleTreeBuilder('sha256');
    messages.forEach((m, i) => b.addLeaf({ index: i, data: hex(m) }));
    return b;
  }

  it('verifies a valid proof for a two-leaf tree', () => {
    const tree = buildTree(['hello', 'world']);
    const proof = tree.generateProof(0);
    const result = new ProofVerifier('sha256').verify(proof);
    expect(result.valid).toBe(true);
  });

  it('verifies valid proofs for all leaves in a four-leaf tree', () => {
    const messages = ['tx-0', 'tx-1', 'tx-2', 'tx-3'];
    const tree = buildTree(messages);
    const verifier = new ProofVerifier('sha256');

    for (let i = 0; i < messages.length; i++) {
      const proof = tree.generateProof(i);
      const result = verifier.verify(proof);
      expect(result.valid).toBe(true);
    }
  });

  it('successfully generates and verifies valid inclusion proofs (acceptance criterion)', () => {
    const messages = ['cross-chain-msg-0', 'cross-chain-msg-1', 'cross-chain-msg-2'];
    const tree = buildTree(messages);
    const verifier = new ProofVerifier('sha256');

    const proof = tree.generateProof(1);
    const { valid } = verifier.verify(proof, tree.getRoot()!);
    expect(valid).toBe(true);
  });

  it('rejects a proof whose leaf hash has been tampered with (acceptance criterion)', () => {
    const tree = buildTree(['genuine', 'also-genuine']);
    const proof = tree.generateProof(0);

    // Tamper: flip one character in the leaf hash
    const tamperedLeaf = proof.leaf.slice(0, -2) + 'ff';
    const tamperedProof = { ...proof, leaf: tamperedLeaf };

    const result = new ProofVerifier('sha256').verify(tamperedProof);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Root mismatch');
  });

  it('rejects a proof with a wrong expected root', () => {
    const tree = buildTree(['node-a', 'node-b']);
    const proof = tree.generateProof(0);
    const fakeRoot = 'a'.repeat(64);

    const result = new ProofVerifier('sha256').verify(proof, fakeRoot);
    expect(result.valid).toBe(false);
  });

  it('rejects a proof with an invalid branch node', () => {
    const tree = buildTree(['x', 'y', 'z', 'w']);
    const proof = tree.generateProof(2);

    const tamperedBranch = [...proof.branch];
    tamperedBranch[0] = 'not-valid-hex!!';
    const badProof = { ...proof, branch: tamperedBranch };

    const result = new ProofVerifier('sha256').verify(badProof);
    expect(result.valid).toBe(false);
  });

  it('returns an error for a proof with a missing leaf', () => {
    const result = ProofVerifier.verifyProof({
      index: 0,
      leaf: '',
      branch: [],
      root: 'abc',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('verifyRawLeaf correctly hashes and verifies a raw leaf value', () => {
    const tree = buildTree(['raw-0', 'raw-1', 'raw-2', 'raw-3']);
    const proof = tree.generateProof(2);
    const verifier = new ProofVerifier('sha256');

    // Pass the raw (unhashed) leaf data
    const result = verifier.verifyRawLeaf(hex('raw-2'), proof, tree.getRoot()!);
    expect(result.valid).toBe(true);
  });

  it('verifyRawLeaf rejects a wrong raw leaf', () => {
    const tree = buildTree(['raw-0', 'raw-1', 'raw-2', 'raw-3']);
    const proof = tree.generateProof(2);
    const verifier = new ProofVerifier('sha256');

    const result = verifier.verifyRawLeaf(hex('WRONG_DATA'), proof, tree.getRoot()!);
    expect(result.valid).toBe(false);
  });

  it('odd-size tree: verifies all leaves in a three-leaf tree', () => {
    const messages = ['one', 'two', 'three'];
    const tree = buildTree(messages);
    const verifier = new ProofVerifier('sha256');

    for (let i = 0; i < messages.length; i++) {
      const proof = tree.generateProof(i);
      expect(verifier.verify(proof).valid).toBe(true);
    }
  });

  it('single-leaf tree root equals the leaf hash', () => {
    const b = new MerkleTreeBuilder('sha256');
    b.addLeaf({ index: 0, data: hex('solo') });
    const proof = b.generateProof(0);
    expect(proof.root).toBe(proof.leaf);
  });
});
