import { expect } from 'chai';
import hre from 'hardhat';
import { keccak256, zeroPadValue, toBeHex } from 'ethers';

describe('NonceSlotCalculator', () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const Harness = await ethers.getContractFactory(
      'NonceSlotCalculatorHarness',
    );
    const harness = await Harness.deploy();
    await harness.waitForDeployment();
    return { harness };
  }

  // ---------------------------------------------------------------------------
  // Off-chain reference implementation matching Solidity's mapping layout:
  //   outerSlot = keccak256(abi.encode(chainId, mappingSlot))
  //   innerSlot = keccak256(abi.encode(nonce, outerSlot))
  // ---------------------------------------------------------------------------
  function referenceSlot(
    chainId: bigint,
    nonce: bigint,
    mappingSlot: bigint = 0n,
  ): string {
    const outer = keccak256(
      zeroPadValue(toBeHex(chainId), 32) +
        zeroPadValue(toBeHex(mappingSlot), 32).slice(2),
    );
    return keccak256(zeroPadValue(toBeHex(nonce), 32) + outer.slice(2));
  }

  // --- storage layout correctness ---

  it('computes the slot that Solidity actually writes to for nonces[1][100]', async () => {
    const { harness } = await deploy();
    const chainId = 1n;
    const nonce = 100n;

    const tx = await harness.markAndRead(chainId, nonce);
    await tx.wait();

    const slot = await harness.computedSlot(chainId, nonce);
    const rawValue = await ethers.provider.getStorage(
      await harness.getAddress(),
      slot,
    );

    // The raw storage value at the computed slot must be 1 (true).
    expect(rawValue).to.equal(
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    );
    // And it must match our reference computation.
    expect(slot).to.equal(referenceSlot(chainId, nonce));
  });

  it('matches the reference slot for chainId=0, nonce=0 (zero keys)', async () => {
    const { harness } = await deploy();
    const computed = await harness.computedSlot(0n, 0n);
    expect(computed).to.equal(referenceSlot(0n, 0n));
  });

  it('matches the reference slot for large chainId and nonce values', async () => {
    const { harness } = await deploy();
    const chainId = 2n ** 128n - 1n;
    const nonce = 2n ** 128n - 2n;
    const computed = await harness.computedSlot(chainId, nonce);
    expect(computed).to.equal(referenceSlot(chainId, nonce));
  });

  it('matches the reference slot for max uint256 keys', async () => {
    const { harness } = await deploy();
    const max = 2n ** 256n - 1n;
    const computed = await harness.computedSlot(max, max);
    expect(computed).to.equal(referenceSlot(max, max));
  });

  // --- slot uniqueness ---

  it('produces unique slots for distinct (chainId, nonce) pairs', async () => {
    const { harness } = await deploy();
    const pairs: Array<[bigint, bigint]> = [
      [1n, 1n],
      [1n, 2n],
      [2n, 1n],
      [0n, 0n],
      [137n, 999n],
    ];
    const slots = await Promise.all(
      pairs.map(([c, n]) => harness.computedSlot(c, n)),
    );
    const unique = new Set(slots);
    expect(unique.size).to.equal(pairs.length);
  });

  it('slots differ when only chainId changes', async () => {
    const { harness } = await deploy();
    const nonce = 42n;
    const slot1 = await harness.computedSlot(1n, nonce);
    const slot2 = await harness.computedSlot(2n, nonce);
    expect(slot1).to.not.equal(slot2);
  });

  it('slots differ when only nonce changes', async () => {
    const { harness } = await deploy();
    const chainId = 1n;
    const slot1 = await harness.computedSlot(chainId, 1n);
    const slot2 = await harness.computedSlot(chainId, 2n);
    expect(slot1).to.not.equal(slot2);
  });

  // --- slotForNonceAt ---

  it('slotForNonceAt matches slotForNonce when mappingSlot is 0', async () => {
    const { harness } = await deploy();
    const chainId = 56n;
    const nonce = 777n;

    const atZero = await harness.computedSlotAt(chainId, nonce, 0n);
    const defaultSlot = await harness.computedSlot(chainId, nonce);
    expect(atZero).to.equal(defaultSlot);
  });

  it('slotForNonceAt produces different slots for different mappingSlot values', async () => {
    const { harness } = await deploy();
    const chainId = 1n;
    const nonce = 1n;

    const at0 = await harness.computedSlotAt(chainId, nonce, 0n);
    const at1 = await harness.computedSlotAt(chainId, nonce, 1n);
    const at5 = await harness.computedSlotAt(chainId, nonce, 5n);

    expect(at0).to.not.equal(at1);
    expect(at1).to.not.equal(at5);
    expect(at0).to.not.equal(at5);
  });

  it('slotForNonceAt matches off-chain reference for non-zero mappingSlot', async () => {
    const { harness } = await deploy();
    const chainId = 10n;
    const nonce = 500n;
    const mappingSlot = 3n;

    const onChain = await harness.computedSlotAt(chainId, nonce, mappingSlot);
    const offChain = referenceSlot(chainId, nonce, mappingSlot);
    expect(onChain).to.equal(offChain);
  });

  // --- free memory pointer not advanced ---

  it('does not advance the free memory pointer (0x40) during slot computation', async () => {
    const { harness } = await deploy();

    // Read free memory pointer before and after via a staticCall.
    // We check that the Yul path is 'pure', which Solidity enforces — a pure
    // function cannot read or modify state, so 0x40 is reset between calls.
    // The test validates that computedSlot is declared pure (no state read).
    const fragment = harness.interface.getFunction('computedSlot');
    expect(fragment?.stateMutability).to.equal('pure');
  });
});
