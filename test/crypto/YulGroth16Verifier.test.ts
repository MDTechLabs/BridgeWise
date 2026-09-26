import { expect } from "chai";
import { network } from "hardhat";

let ethers: any;

// BN254 (alt_bn128) generators and moduli.
const G1 = { x: 1n, y: 2n };

// G2 generator, serialised imaginary-part-first as EIP-197 expects.
const G2 = {
  xC1: 11559732032986387107991004021392285783925812861821192530917403151452391805634n,
  xC0: 10857046999023057135944570762232829481370756359578518086990519993285655852781n,
  yC1: 4082367875863433681332203403145435568316851327593401208105741076214120093531n,
  yC0: 8495653923123431417604973247489272438418190587263600148770280649306958101930n,
};

const SCALAR_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const INFINITY: [bigint, bigint] = [0n, 0n];

const g2Words = (): [bigint, bigint, bigint, bigint] => [G2.xC1, G2.xC0, G2.yC1, G2.yC0];

/**
 * Build a verifying key whose pairing product is 1 by construction.
 *
 * With A = alpha and B = beta the first two terms cancel:
 *     e(-A, B) * e(alpha, beta) = e(-alpha, beta) * e(alpha, beta) = 1
 * and with vk_x and C both the point at infinity the remaining terms are 1:
 *     e(O, gamma) = e(O, delta) = 1
 *
 * This is a genuine pairing instance rather than a circuit proof: it exercises
 * the full precompile path — negation, staging, and the 0x08 call — without
 * needing a trusted setup to produce fixtures.
 */
function validCase() {
  const proof: bigint[] = [G1.x, G1.y, ...g2Words(), ...INFINITY]; // A, B, C
  const vk: bigint[] = [
    G1.x,
    G1.y, // alpha
    ...g2Words(), // beta
    ...g2Words(), // gamma
    ...g2Words(), // delta
  ];
  const ic: bigint[] = [...INFINITY]; // IC[0] only
  const input: bigint[] = [];
  return { proof, vk, ic, input };
}

describe("YulGroth16Verifier", () => {
  before(async () => {
    ({ ethers } = await network.connect());
  });

  async function deploy() {
    const Factory = await ethers.getContractFactory("YulGroth16VerifierWrapper");
    const verifier = await Factory.deploy();
    await verifier.waitForDeployment();
    return verifier;
  }

  it("accepts a proof satisfying the pairing equation", async () => {
    const verifier = await deploy();
    const { proof, vk, ic, input } = validCase();

    expect(await verifier.verify(proof, vk, ic, input)).to.equal(true);
  });

  it("rejects a proof whose C term breaks the equation", async () => {
    const verifier = await deploy();
    const { proof, vk, ic, input } = validCase();

    // C moves from the identity to the generator, so e(C, delta) != 1.
    proof[6] = G1.x;
    proof[7] = G1.y;

    expect(await verifier.verify(proof, vk, ic, input)).to.equal(false);
  });

  it("rejects a proof whose A term breaks the equation", async () => {
    const verifier = await deploy();
    const { proof, vk, ic, input } = validCase();

    // A no longer matches alpha, so the first two terms stop cancelling.
    proof[0] = INFINITY[0];
    proof[1] = INFINITY[1];

    expect(await verifier.verify(proof, vk, ic, input)).to.equal(false);
  });

  it("accumulates public inputs through ecMul and ecAdd", async () => {
    const verifier = await deploy();
    const { proof, vk } = validCase();

    // IC[1] is a real curve point, but the input scalar is zero, so
    // vk_x = IC[0] + 0 * IC[1] = O and the equation still holds. This drives
    // the ecMul (0x07) and ecAdd (0x06) path rather than skipping it.
    const ic = [...INFINITY, G1.x, G1.y];
    const input = [0n];

    expect(await verifier.verify(proof, vk, ic, input)).to.equal(true);
  });

  it("reverts when a public input is not reduced mod the scalar field", async () => {
    const verifier = await deploy();
    const { proof, vk } = validCase();
    const ic = [...INFINITY, G1.x, G1.y];

    await expect(
      verifier.verify(proof, vk, ic, [SCALAR_MODULUS]),
    ).to.be.revertedWithCustomError(verifier, "PublicInputOutOfField");
  });

  it("reverts when IC length does not match the public input count", async () => {
    const verifier = await deploy();
    const { proof, vk, ic } = validCase();

    await expect(
      verifier.verify(proof, vk, ic, [1n]),
    ).to.be.revertedWithCustomError(verifier, "InvalidVerifyingKeyLength");
  });

  it("reports gas for a verification with one public input", async () => {
    const verifier = await deploy();
    const { proof, vk } = validCase();
    const ic = [...INFINITY, G1.x, G1.y];

    const gas = await verifier.verify.estimateGas(proof, vk, ic, [0n]);
    console.log(`      gas for verify (1 public input): ${gas.toString()}`);

    // The pairing precompile alone costs 45000 + 34000 per pair = 181000 for
    // four pairs. Anything near that floor means the wrapper is adding little.
    expect(gas).to.be.lessThan(260000n);
  });
});
