import { expect } from "chai";
import { ethers } from "hardhat";

describe("MerkleProofYul", () => {
  async function deploy() {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MerkleProofYulWrapper");
    const verifier = await Factory.deploy();
    await verifier.waitForDeployment();
    return { verifier };
  }

  // Helper: build a simple 4-leaf Merkle tree
  function buildTree(leaves: string[]): { root: string; tree: string[] } {
    const hashed = leaves.map((l) => ethers.keccak256(ethers.toUtf8Bytes(l)));
    const tree = [...hashed];

    let level = [...hashed];
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : level[i];
        const sorted = left < right ? [left, right] : [right, left];
        next.push(ethers.keccak256(ethers.concat(sorted)));
      }
      level = next;
    }

    return { root: level[0], tree };
  }

  function getProof(tree: string[], index: number): string[] {
    const proof: string[] = [];
    let level = [...tree];
    let idx = index;

    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : level[i];
        if (i === idx || i + 1 === idx) {
          proof.push(i === idx ? right : left);
        }
        const sorted = left < right ? [left, right] : [right, left];
        next.push(ethers.keccak256(ethers.concat(sorted)));
      }
      level = next;
      idx = Math.floor(idx / 2);
    }

    return proof;
  }

  it("verifies a valid 4-leaf Merkle proof", async () => {
    const { verifier } = await deploy();
    const leaves = ["apple", "banana", "cherry", "date"];
    const { root, tree } = buildTree(leaves);

    const proof = getProof(tree, 0);
    expect(await verifier.verify(proof, root, tree[0])).to.equal(true);
  });

  it("verifies each leaf in a 4-leaf tree", async () => {
    const { verifier } = await deploy();
    const leaves = ["alpha", "beta", "gamma", "delta"];
    const { root, tree } = buildTree(leaves);

    for (let i = 0; i < leaves.length; i++) {
      const proof = getProof(tree, i);
      expect(await verifier.verify(proof, root, tree[i])).to.equal(true);
    }
  });

  it("rejects a tampered leaf", async () => {
    const { verifier } = await deploy();
    const leaves = ["one", "two", "three", "four"];
    const { root, tree } = buildTree(leaves);

    const fakeLeaf = ethers.keccak256(ethers.toUtf8Bytes("tampered"));
    const proof = getProof(tree, 0);
    expect(await verifier.verify(proof, root, fakeLeaf)).to.equal(false);
  });

  it("rejects a wrong root", async () => {
    const { verifier } = await deploy();
    const leaves = ["x", "y", "z"];
    const { tree } = buildTree(leaves);

    const fakeRoot = ethers.keccak256(ethers.toUtf8Bytes("wrong-root"));
    const proof = getProof(tree, 0);
    expect(await verifier.verify(proof, fakeRoot, tree[0])).to.equal(false);
  });

  it("rejects an empty proof with non-matching root", async () => {
    const { verifier } = await deploy();
    const leaf = ethers.keccak256(ethers.toUtf8Bytes("solo"));
    const fakeRoot = ethers.keccak256(ethers.toUtf8Bytes("nope"));
    expect(await verifier.verify([], fakeRoot, leaf)).to.equal(false);
  });

  it("verifies a single-leaf tree (empty proof)", async () => {
    const { verifier } = await deploy();
    const leaf = ethers.keccak256(ethers.toUtf8Bytes("only"));
    // Root of a single-leaf tree is the leaf itself
    expect(await verifier.verify([], leaf, leaf)).to.equal(true);
  });
});
