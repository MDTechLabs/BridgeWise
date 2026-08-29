import { expect } from "chai";
import hre from "hardhat";

describe("YulMultiSigVerifier", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const Factory = await ethers.getContractFactory("YulMultiSigVerifierWrapper");
    const wrapper = await Factory.deploy();
    await wrapper.waitForDeployment();
    return { wrapper };
  }

  function randomWallets(count: number) {
    const wallets = [];
    for (let i = 0; i < count; i++) {
      wallets.push(ethers.Wallet.createRandom());
    }
    return wallets;
  }

  function byAddressAscending(a: any, b: any) {
    return a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1;
  }

  // Signs `messageHash` (personal_sign / EIP-191 style, matching the
  // contract's "\x19Ethereum Signed Message:\n32" prefix) with each wallet
  // in `wallets`, IN THE ORDER GIVEN, and packs the resulting signatures as
  // 65-byte [r(32) || s(32) || v(1)] tuples concatenated together. The
  // caller is responsible for ordering `wallets` however the test scenario
  // requires (ascending-by-address for the happy path, or deliberately out
  // of order / duplicated to exercise rejection paths).
  async function packSignatures(wallets: any[], messageHash: string) {
    const chunks: string[] = [];
    for (const wallet of wallets) {
      const sig = await wallet.signMessage(ethers.getBytes(messageHash));
      const { r, s, v } = ethers.Signature.from(sig);
      chunks.push(ethers.solidityPacked(["bytes32", "bytes32", "uint8"], [r, s, v]));
    }
    return ethers.concat(chunks);
  }

  let messageHash: string;

  beforeEach(() => {
    messageHash = ethers.keccak256(ethers.toUtf8Bytes("YulMultiSigVerifier quorum payload"));
  });

  it("accepts a valid quorum of correctly-sorted, distinct validator signatures", async () => {
    const { wrapper } = await deploy();

    const validators = randomWallets(5).sort(byAddressAscending);
    const sortedValidatorAddresses = validators.map((w) => w.address);

    // Take a subset (3 of 5) in ascending-address order to meet a threshold of 3.
    const signingSet = [validators[0], validators[2], validators[4]];
    const packedSignatures = await packSignatures(signingSet, messageHash);

    const result = await wrapper.verifyQuorum(
      messageHash,
      packedSignatures,
      sortedValidatorAddresses,
      3
    );
    expect(result).to.equal(true);
  });

  it("rejects signatures not in strictly-ascending recovered-address order", async () => {
    const { wrapper } = await deploy();

    const validators = randomWallets(5).sort(byAddressAscending);
    const sortedValidatorAddresses = validators.map((w) => w.address);

    const signingSet = [validators[0], validators[2], validators[4]];
    // Reverse the signing order: descending instead of ascending. The
    // first comparison (index 0) always passes (lastSigner starts at 0),
    // so the violation is detected at index 1.
    const packedSignatures = await packSignatures([...signingSet].reverse(), messageHash);

    await expect(
      wrapper.verifyQuorum(messageHash, packedSignatures, sortedValidatorAddresses, 3)
    )
      .to.be.revertedWithCustomError(wrapper, "UnsortedOrDuplicateSignature")
      .withArgs(1);
  });

  it("rejects a duplicate signature (same signer twice)", async () => {
    const { wrapper } = await deploy();

    const validators = randomWallets(3).sort(byAddressAscending);
    const sortedValidatorAddresses = validators.map((w) => w.address);

    // Same validator's signature repeated: the second recovers the same
    // address as the first, so `signer <= lastSigner` trips at index 1.
    const packedSignatures = await packSignatures(
      [validators[0], validators[0]],
      messageHash
    );

    await expect(
      wrapper.verifyQuorum(messageHash, packedSignatures, sortedValidatorAddresses, 1)
    )
      .to.be.revertedWithCustomError(wrapper, "UnsortedOrDuplicateSignature")
      .withArgs(1);
  });

  it("excludes a non-validator signer from the valid count and fails quorum", async () => {
    const { wrapper } = await deploy();

    const validators = randomWallets(2).sort(byAddressAscending);
    const sortedValidatorAddresses = validators.map((w) => w.address);

    const outsider = ethers.Wallet.createRandom();

    // Sign with both real validators plus an outsider, all packed in
    // strictly-ascending address order so the ordering check passes and
    // only the membership check filters the outsider out.
    const signingSet = [...validators, outsider].sort(byAddressAscending);
    const packedSignatures = await packSignatures(signingSet, messageHash);

    // 3 signatures recovered and sorted correctly, but only 2 are actual
    // validators -> validCount = 2, which is below a threshold of 3.
    await expect(
      wrapper.verifyQuorum(messageHash, packedSignatures, sortedValidatorAddresses, 3)
    )
      .to.be.revertedWithCustomError(wrapper, "QuorumNotMet")
      .withArgs(2, 3);
  });

  it("rejects when quorum threshold is not met", async () => {
    const { wrapper } = await deploy();

    const validators = randomWallets(5).sort(byAddressAscending);
    const sortedValidatorAddresses = validators.map((w) => w.address);

    // Only 1 signature submitted against a threshold of 3.
    const packedSignatures = await packSignatures([validators[0]], messageHash);

    await expect(
      wrapper.verifyQuorum(messageHash, packedSignatures, sortedValidatorAddresses, 3)
    )
      .to.be.revertedWithCustomError(wrapper, "QuorumNotMet")
      .withArgs(1, 3);
  });

  describe("zero memory-expansion overhead", () => {
    // Rather than asserting an exact gas figure (fragile across compiler /
    // optimizer versions), we assert that gas scales roughly LINEARLY with
    // the number of signatures rather than super-linearly, which is what
    // would happen if a `bytes[]` / tuple array were being built up in
    // memory per-signature (memory expansion cost is quadratic-ish: cost
    // grows with the square of the highest memory word touched). Because
    // this contract only ever touches a fixed 0x00-0xa0 scratch window
    // regardless of loop index, the marginal cost per extra signature
    // should stay essentially flat (dominated by the ~3000 gas ecrecover
    // precompile charge + calldata reads + a small binary-search cost),
    // not grow with `i`.
    async function measureGas(sigCounts: number[]) {
      const { wrapper } = await deploy();
      const results: Record<number, bigint> = {};

      for (const count of sigCounts) {
        const validators = randomWallets(count).sort(byAddressAscending);
        const sortedValidatorAddresses = validators.map((w) => w.address);
        const packedSignatures = await packSignatures(validators, messageHash);

        const gas: bigint = await wrapper.verifyQuorum.estimateGas(
          messageHash,
          packedSignatures,
          sortedValidatorAddresses,
          count
        );
        results[count] = gas;
      }

      return results;
    }

    it("scales roughly linearly (flat marginal cost) from 5 to 20 signatures", async () => {
      const gasByCount = await measureGas([5, 10, 20]);

      // eslint-disable-next-line no-console
      console.log(
        `Measured gas — 5 sigs: ${gasByCount[5]}, 10 sigs: ${gasByCount[10]}, 20 sigs: ${gasByCount[20]}`
      );

      const marginal5to10 = (gasByCount[10] - gasByCount[5]) / 5n;
      const marginal10to20 = (gasByCount[20] - gasByCount[10]) / 10n;

      console.log(
        `Marginal gas/signature — 5->10: ${marginal5to10}, 10->20: ${marginal10to20}`
      );

      // If memory were being expanded per-signature (e.g. building a
      // decoded array in memory), the marginal cost of the *second* half
      // of the batch would be visibly larger than the first half's,
      // because memory-expansion cost grows with the square of the
      // highest word touched. With zero per-iteration memory growth, the
      // two marginal rates should be close to each other. We allow a
      // generous 2x band to absorb the binary-search's O(log n) growth
      // and any incidental variance.
      expect(marginal10to20).to.be.lessThan(marginal5to10 * 2n);

      // Absolute, coarse ceiling: a naive per-signature memory-expanding
      // implementation at 20 signatures would blow well past this (each
      // additional 32/65-byte memory allocation compounds quadratically).
      // A flat-scratch-space implementation comfortably clears it.
      expect(gasByCount[20]).to.be.lessThan(500_000n);
    });
  });
});
