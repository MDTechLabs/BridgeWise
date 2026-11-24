import { expect } from "chai";
import hre from "hardhat";

describe("Production MultiSig Threshold & Signer Unavailability Suite", () => {
  let ethers: any;
  let networkHelpers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    networkHelpers = connection.networkHelpers;
  });

  async function deployVerifier() {
    const Factory = await ethers.getContractFactory("YulMultiSigVerifierWrapper");
    const verifier = await Factory.deploy();
    await verifier.waitForDeployment();
    return { verifier };
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

  async function packSignatures(wallets: any[], messageHash: string) {
    const chunks: string[] = [];
    for (const wallet of wallets) {
      const sig = await wallet.signMessage(ethers.getBytes(messageHash));
      const { r, s, v } = ethers.Signature.from(sig);
      chunks.push(ethers.solidityPacked(["bytes32", "bytes32", "uint8"], [r, s, v]));
    }
    return ethers.concat(chunks);
  }

  // Multi-chain domain separator helper
  function computeDomainSeparator(chainId: number, bridgeAddress: string) {
    const DOMAIN_TYPEHASH = ethers.keccak256(
      ethers.toUtf8Bytes(
        "BridgeWiseDomain(string name,string version,uint256 sourceChainId,uint256 targetChainId,address bridgeAddress)"
      )
    );
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32", "bytes32", "uint256", "uint256", "address"],
        [
          DOMAIN_TYPEHASH,
          ethers.keccak256(ethers.toUtf8Bytes("BridgeWise")),
          ethers.keccak256(ethers.toUtf8Bytes("1")),
          1n, // sourceChainId
          BigInt(chainId),
          bridgeAddress,
        ]
      )
    );
  }

  describe("Signer Unavailability & Partial Availability (Threshold M-of-N)", () => {
    let messageHash: string;

    beforeEach(() => {
      messageHash = ethers.keccak256(ethers.toUtf8Bytes("BridgeWise Payload v1.0"));
    });

    it("succeeds when all signers are available (7 of 7, threshold 5)", async () => {
      const { verifier } = await deployVerifier();
      const validators = randomWallets(7).sort(byAddressAscending);
      const validatorAddresses = validators.map((v) => v.address);

      const packed = await packSignatures(validators, messageHash);
      const ok = await verifier.verifyQuorum(messageHash, packed, validatorAddresses, 5);
      expect(ok).to.be.true;
    });

    it("succeeds when exactly threshold signers are available (5 of 7, threshold 5)", async () => {
      const { verifier } = await deployVerifier();
      const validators = randomWallets(7).sort(byAddressAscending);
      const validatorAddresses = validators.map((v) => v.address);

      // 2 signers unavailable/offline (indices 1 and 4 offline)
      const availableSigners = [
        validators[0],
        validators[2],
        validators[3],
        validators[5],
        validators[6],
      ];
      const packed = await packSignatures(availableSigners, messageHash);

      const ok = await verifier.verifyQuorum(messageHash, packed, validatorAddresses, 5);
      expect(ok).to.be.true;
    });

    it("fails safely when threshold is starved by 1 missing signer (4 of 7, threshold 5)", async () => {
      const { verifier } = await deployVerifier();
      const validators = randomWallets(7).sort(byAddressAscending);
      const validatorAddresses = validators.map((v) => v.address);

      // 3 signers unavailable (only 4 available, threshold requires 5)
      const availableSigners = [validators[0], validators[2], validators[4], validators[6]];
      const packed = await packSignatures(availableSigners, messageHash);

      await expect(
        verifier.verifyQuorum(messageHash, packed, validatorAddresses, 5)
      )
        .to.be.revertedWithCustomError(verifier, "QuorumNotMet")
        .withArgs(4, 5);
    });

    it("fails safely when threshold is starved during major partition (2 of 7, threshold 5)", async () => {
      const { verifier } = await deployVerifier();
      const validators = randomWallets(7).sort(byAddressAscending);
      const validatorAddresses = validators.map((v) => v.address);

      // 5 signers unavailable
      const availableSigners = [validators[0], validators[3]];
      const packed = await packSignatures(availableSigners, messageHash);

      await expect(
        verifier.verifyQuorum(messageHash, packed, validatorAddresses, 5)
      )
        .to.be.revertedWithCustomError(verifier, "QuorumNotMet")
        .withArgs(2, 5);
    });

    it("fails safely when all signers are unavailable (0 signatures)", async () => {
      const { verifier } = await deployVerifier();
      const validators = randomWallets(5).sort(byAddressAscending);
      const validatorAddresses = validators.map((v) => v.address);

      await expect(
        verifier.verifyQuorum(messageHash, "0x", validatorAddresses, 3)
      )
        .to.be.revertedWithCustomError(verifier, "QuorumNotMet")
        .withArgs(0, 3);
    });
  });

  describe("Adversarial Bypass Attacks Under Signer Unavailability", () => {
    let messageHash: string;

    beforeEach(() => {
      messageHash = ethers.keccak256(ethers.toUtf8Bytes("Adversarial Payload Test"));
    });

    it("rejects duplicate signatures used to simulate unavailable signers", async () => {
      const { verifier } = await deployVerifier();
      const validators = randomWallets(5).sort(byAddressAscending);
      const validatorAddresses = validators.map((v) => v.address);

      // Attacker has only 2 signers available: [v0, v1].
      // Attacker duplicates v1 to fake 3 signatures: [v0, v1, v1]
      const forgedSet = [validators[0], validators[1], validators[1]];
      const packed = await packSignatures(forgedSet, messageHash);

      await expect(
        verifier.verifyQuorum(messageHash, packed, validatorAddresses, 3)
      )
        .to.be.revertedWithCustomError(verifier, "UnsortedOrDuplicateSignature")
        .withArgs(2); // Detected at index 2 (v1 <= v1)
    });

    it("rejects unauthorized outsider signatures injected to replace missing signers", async () => {
      const { verifier } = await deployVerifier();
      const validators = randomWallets(5).sort(byAddressAscending);
      const validatorAddresses = validators.map((v) => v.address);

      // Only 2 validators available, attacker generates 1 rogue key to reach threshold 3
      const rogueSigner = ethers.Wallet.createRandom();
      const signingSet = [validators[0], validators[2], rogueSigner].sort(byAddressAscending);
      const packed = await packSignatures(signingSet, messageHash);

      // 3 correctly-sorted signatures, but rogueSigner is rejected by binary search
      await expect(
        verifier.verifyQuorum(messageHash, packed, validatorAddresses, 3)
      )
        .to.be.revertedWithCustomError(verifier, "QuorumNotMet")
        .withArgs(2, 3);
    });

    it("rejects out-of-order signature bundles (Invariant M-2)", async () => {
      const { verifier } = await deployVerifier();
      const validators = randomWallets(5).sort(byAddressAscending);
      const validatorAddresses = validators.map((v) => v.address);

      const signingSet = [validators[0], validators[2], validators[4]];
      // Reverse order (descending instead of ascending)
      const packed = await packSignatures([...signingSet].reverse(), messageHash);

      await expect(
        verifier.verifyQuorum(messageHash, packed, validatorAddresses, 3)
      )
        .to.be.revertedWithCustomError(verifier, "UnsortedOrDuplicateSignature")
        .withArgs(1);
    });

    it("rejects malformed signature length (not multiple of 65 bytes)", async () => {
      const { verifier } = await deployVerifier();
      const validators = randomWallets(3).sort(byAddressAscending);
      const validatorAddresses = validators.map((v) => v.address);

      const packed = await packSignatures([validators[0]], messageHash);
      // Slice off 1 byte so length is 64 instead of 65
      const truncated = packed.slice(0, packed.length - 2);

      await expect(
        verifier.verifyQuorum(messageHash, truncated, validatorAddresses, 1)
      ).to.be.revertedWithCustomError(verifier, "InvalidSignatureLength");
    });
  });

  describe("Cross-Chain Domain Separation & Replay Resistance", () => {
    it("fails verification when message signed for Ethereum (1) is replayed on Arbitrum (42161)", async () => {
      const { verifier } = await deployVerifier();
      const bridgeAddress = await verifier.getAddress();

      const validators = randomWallets(5).sort(byAddressAscending);
      const validatorAddresses = validators.map((v) => v.address);

      const ethDomain = computeDomainSeparator(1, bridgeAddress);
      const arbDomain = computeDomainSeparator(42161, bridgeAddress);

      const rawPayload = ethers.keccak256(ethers.toUtf8Bytes("CrossChainTransfer(1000)"));

      // Message digest bound to Ethereum (1)
      const ethDigest = ethers.keccak256(
        ethers.solidityPacked(["bytes32", "bytes32"], [ethDomain, rawPayload])
      );
      // Message digest bound to Arbitrum (42161)
      const arbDigest = ethers.keccak256(
        ethers.solidityPacked(["bytes32", "bytes32"], [arbDomain, rawPayload])
      );

      // Validators sign Ethereum digest
      const ethPackedSignatures = await packSignatures(
        [validators[0], validators[1], validators[2]],
        ethDigest
      );

      // Replaying Ethereum signatures against Arbitrum digest fails verification safely
      // (either UnsortedOrDuplicateSignature due to random recovered addresses or QuorumNotMet)
      let threw = false;
      try {
        await verifier.verifyQuorum(arbDigest, ethPackedSignatures, validatorAddresses, 3);
      } catch (err: any) {
        threw = true;
      }
      expect(threw).to.be.true;
    });
  });

  describe("Validator Set Rotation & Grace Period Under Unavailability", () => {
    it("ensures old validator set remains active during rotation epoch timelock", async () => {
      const [admin, proposer] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("ValidatorSetManager");
      const EPOCH_DELAY = 3600; // 1 hour
      const OVERLAP = 7200; // 2 hours
      const mgr = await Factory.deploy(admin.address, EPOCH_DELAY, OVERLAP);
      await mgr.waitForDeployment();

      const PROPOSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROPOSER_ROLE"));
      await mgr.grantRole(PROPOSER_ROLE, proposer.address);

      const APPROVER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("APPROVER_ROLE"));
      await mgr.grantRole(APPROVER_ROLE, admin.address);

      const oldSet = randomWallets(3).map((w) => w.address);
      const newSet = randomWallets(3).map((w) => w.address);

      // Initialize with old set
      await mgr.connect(proposer).proposeValidatorSet(oldSet, 2);
      await mgr.connect(admin).approveValidatorSet();
      await networkHelpers.time.increase(EPOCH_DELAY + 1);
      await mgr.connect(proposer).activateValidatorSet();

      expect(await mgr.isValidator(oldSet[0])).to.be.true;
      expect(await mgr.isValidator(newSet[0])).to.be.false;

      // Propose rotation to new set
      await mgr.connect(proposer).proposeValidatorSet(newSet, 2);
      await mgr.connect(admin).approveValidatorSet();

      // While pending (new signers are not yet ready / during timelock delay), old set stays active
      expect(await mgr.hasPendingProposal()).to.be.true;
      expect(await mgr.isValidator(oldSet[0])).to.be.true;
      expect(await mgr.isValidator(newSet[0])).to.be.false;

      // Early activation attempt reverts
      await expect(mgr.connect(proposer).activateValidatorSet()).to.be.revertedWithCustomError(
        mgr,
        "TimelockNotExpired"
      );

      // Once epoch delay passes, activation succeeds
      await networkHelpers.time.increase(EPOCH_DELAY + 1);
      await mgr.connect(proposer).activateValidatorSet();

      expect(await mgr.isValidator(newSet[0])).to.be.true;
      expect(await mgr.isValidator(oldSet[0])).to.be.false;
    });
  });

  describe("Gas & Resource Bounds for Worst-Case Inputs", () => {
    it("measures worst-case gas across varying validator set sizes (5, 10, 20)", async () => {
      const { verifier } = await deployVerifier();
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes("Gas benchmark payload"));

      const counts = [5, 10, 20];
      const gasResults: Record<number, bigint> = {};

      for (const count of counts) {
        const validators = randomWallets(count).sort(byAddressAscending);
        const addresses = validators.map((v) => v.address);
        const packed = await packSignatures(validators, messageHash);

        const gas = await verifier.verifyQuorum.estimateGas(
          messageHash,
          packed,
          addresses,
          count
        );
        gasResults[count] = gas;
      }

      console.log(
        `[MultiSig Benchmark] 5 signers: ${gasResults[5]} gas | 10 signers: ${gasResults[10]} gas | 20 signers: ${gasResults[20]} gas`
      );

      // Confirm strictly bounded: 20 signatures consumes well under block limit (< 300k gas)
      expect(gasResults[20]).to.be.lessThan(300_000n);

      // Confirm linear scaling without quadratic memory expansion penalties
      const marginal5to10 = (gasResults[10] - gasResults[5]) / 5n;
      const marginal10to20 = (gasResults[20] - gasResults[10]) / 10n;
      expect(marginal10to20).to.be.lessThan(marginal5to10 * 2n);
    });
  });
});
