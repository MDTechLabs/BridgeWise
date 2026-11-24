import { expect } from "chai";
import hre from "hardhat";

describe("BridgeMultiSigOwnable Production Tests", () => {
  let ethers: any;
  let networkHelpers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    networkHelpers = connection.networkHelpers;
  });

  async function deployFixture(threshold = 2, ownerCount = 3) {
    const signers = await ethers.getSigners();
    const owners = signers.slice(0, ownerCount);
    const nonOwner = signers[ownerCount];
    const attacker = signers[ownerCount + 1];

    const ownerAddresses = owners.map((o: any) => o.address);
    const MultiSigFactory = await ethers.getContractFactory("BridgeMultiSigOwnable");
    const multiSig = await MultiSigFactory.deploy(ownerAddresses, threshold);
    await multiSig.waitForDeployment();

    const MockTargetFactory = await ethers.getContractFactory("MockMessageTarget");
    const mockTarget = await MockTargetFactory.deploy();
    await mockTarget.waitForDeployment();

    return {
      multiSig,
      mockTarget,
      owners,
      nonOwner,
      attacker,
      threshold,
      ownerAddresses,
    };
  }

  describe("Constructor & Initialization Invariants", () => {
    it("deploys successfully with valid owners and threshold", async () => {
      const { multiSig, ownerAddresses, threshold } = await deployFixture(2, 3);

      expect(await multiSig.requiredThreshold()).to.equal(threshold);
      const storedOwners = await multiSig.getOwners();
      expect(storedOwners.length).to.equal(ownerAddresses.length);
      for (const addr of ownerAddresses) {
        expect(await multiSig.isOwner(addr)).to.be.true;
      }
    });

    it("reverts if owners array is empty", async () => {
      const MultiSigFactory = await ethers.getContractFactory("BridgeMultiSigOwnable");
      await expect(MultiSigFactory.deploy([], 1)).to.be.revertedWith(
        "BridgeMultiSig: owners required"
      );
    });

    it("reverts if threshold is zero", async () => {
      const [o1, o2] = await ethers.getSigners();
      const MultiSigFactory = await ethers.getContractFactory("BridgeMultiSigOwnable");
      await expect(MultiSigFactory.deploy([o1.address, o2.address], 0)).to.be.revertedWith(
        "BridgeMultiSig: invalid threshold"
      );
    });

    it("reverts if threshold exceeds owner count", async () => {
      const [o1, o2] = await ethers.getSigners();
      const MultiSigFactory = await ethers.getContractFactory("BridgeMultiSigOwnable");
      await expect(MultiSigFactory.deploy([o1.address, o2.address], 3)).to.be.revertedWith(
        "BridgeMultiSig: invalid threshold"
      );
    });

    it("reverts if any owner is address(0)", async () => {
      const [o1] = await ethers.getSigners();
      const MultiSigFactory = await ethers.getContractFactory("BridgeMultiSigOwnable");
      await expect(
        MultiSigFactory.deploy([o1.address, ethers.ZeroAddress], 1)
      ).to.be.revertedWith("BridgeMultiSig: invalid owner address");
    });

    it("reverts on duplicate owner address", async () => {
      const [o1] = await ethers.getSigners();
      const MultiSigFactory = await ethers.getContractFactory("BridgeMultiSigOwnable");
      await expect(
        MultiSigFactory.deploy([o1.address, o1.address], 1)
      ).to.be.revertedWith("BridgeMultiSig: duplicate owner");
    });
  });

  describe("Transaction Proposals", () => {
    it("allows an owner to propose a transaction with duration >= 300s", async () => {
      const { multiSig, mockTarget, owners } = await deployFixture(2, 3);
      const proposer = owners[0];
      const targetAddr = await mockTarget.getAddress();
      const callData = mockTarget.interface.encodeFunctionData("record", [42n]);
      const duration = 600; // 10 minutes

      const tx = await multiSig.connect(proposer).proposeTransaction(targetAddr, 0, callData, duration);
      await expect(tx)
        .to.emit(multiSig, "ProposalCreated")
        .withArgs(0, proposer.address, targetAddr, callData);
      await expect(tx)
        .to.emit(multiSig, "ProposalConfirmed")
        .withArgs(0, proposer.address);

      expect(await multiSig.getProposalsCount()).to.equal(1);
      const proposal = await multiSig.proposals(0);
      expect(proposal.target).to.equal(targetAddr);
      expect(proposal.value).to.equal(0n);
      expect(proposal.executed).to.be.false;
      expect(proposal.confirmationsCount).to.equal(1);
      expect(await multiSig.isConfirmed(0, proposer.address)).to.be.true;
    });

    it("reverts if duration is under 300 seconds", async () => {
      const { multiSig, mockTarget, owners } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();
      const callData = mockTarget.interface.encodeFunctionData("record", [42n]);

      await expect(
        multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, callData, 299)
      ).to.be.revertedWith("BridgeMultiSig: duration too short");
    });

    it("reverts if target address is address(0)", async () => {
      const { multiSig, owners } = await deployFixture(2, 3);

      await expect(
        multiSig.connect(owners[0]).proposeTransaction(ethers.ZeroAddress, 0, "0x", 300)
      ).to.be.revertedWith("BridgeMultiSig: invalid target");
    });

    it("reverts if non-owner attempts to propose", async () => {
      const { multiSig, mockTarget, nonOwner } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();

      await expect(
        multiSig.connect(nonOwner).proposeTransaction(targetAddr, 0, "0x", 300)
      ).to.be.revertedWith("BridgeMultiSig: caller is not an owner");
    });
  });

  describe("Confirmation & Revocation State Transitions", () => {
    it("allows second owner to confirm", async () => {
      const { multiSig, mockTarget, owners } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();
      const callData = mockTarget.interface.encodeFunctionData("record", [100n]);

      await multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, callData, 500);

      await expect(multiSig.connect(owners[1]).confirmTransaction(0))
        .to.emit(multiSig, "ProposalConfirmed")
        .withArgs(0, owners[1].address);

      const prop = await multiSig.proposals(0);
      expect(prop.confirmationsCount).to.equal(2);
      expect(await multiSig.isConfirmed(0, owners[1].address)).to.be.true;
    });

    it("reverts if same owner confirms twice", async () => {
      const { multiSig, mockTarget, owners } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();
      const callData = mockTarget.interface.encodeFunctionData("record", [100n]);

      await multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, callData, 500);

      await expect(multiSig.connect(owners[0]).confirmTransaction(0)).to.be.revertedWith(
        "BridgeMultiSig: proposal already confirmed"
      );
    });

    it("reverts if non-owner attempts confirmation", async () => {
      const { multiSig, mockTarget, owners, nonOwner } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();

      await multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, "0x", 500);

      await expect(multiSig.connect(nonOwner).confirmTransaction(0)).to.be.revertedWith(
        "BridgeMultiSig: caller is not an owner"
      );
    });

    it("allows an owner to revoke their confirmation and decrements count", async () => {
      const { multiSig, mockTarget, owners } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();

      await multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, "0x", 500);
      await multiSig.connect(owners[1]).confirmTransaction(0);

      expect((await multiSig.proposals(0)).confirmationsCount).to.equal(2);

      await expect(multiSig.connect(owners[1]).revokeConfirmation(0))
        .to.emit(multiSig, "ProposalRevoked")
        .withArgs(0, owners[1].address);

      expect((await multiSig.proposals(0)).confirmationsCount).to.equal(1);
      expect(await multiSig.isConfirmed(0, owners[1].address)).to.be.false;
    });

    it("reverts if an unconfirmed owner attempts revocation", async () => {
      const { multiSig, mockTarget, owners } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();

      await multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, "0x", 500);

      await expect(multiSig.connect(owners[2]).revokeConfirmation(0)).to.be.revertedWith(
        "BridgeMultiSig: proposal not confirmed"
      );
    });
  });

  describe("Signer Unavailability & Quorum Failure Paths", () => {
    it("fails execution when signers are unavailable and threshold is not met (1 of 2)", async () => {
      const { multiSig, mockTarget, owners } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();
      const callData = mockTarget.interface.encodeFunctionData("record", [1n]);

      // Only proposer confirms (1 of 2 required)
      await multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, callData, 600);

      await expect(multiSig.connect(owners[0]).executeTransaction(0)).to.be.revertedWith(
        "BridgeMultiSig: threshold not met"
      );

      // Verify target state did not mutate
      expect(await mockTarget.callCount()).to.equal(0);
      expect((await multiSig.proposals(0)).executed).to.be.false;
    });

    it("fails execution when threshold drops below required due to signer revocation", async () => {
      const { multiSig, mockTarget, owners } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();
      const callData = mockTarget.interface.encodeFunctionData("record", [99n]);

      await multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, callData, 600);
      await multiSig.connect(owners[1]).confirmTransaction(0);

      // Now threshold is met (2/2), but owner 1 revokes confirmation
      await multiSig.connect(owners[1]).revokeConfirmation(0);

      // Attempt execution with 1 confirmation remaining
      await expect(multiSig.connect(owners[0]).executeTransaction(0)).to.be.revertedWith(
        "BridgeMultiSig: threshold not met"
      );

      expect(await mockTarget.callCount()).to.equal(0);
      expect((await multiSig.proposals(0)).executed).to.be.false;
    });

    it("fails execution when signers are unavailable and proposal expires", async () => {
      const { multiSig, mockTarget, owners } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();
      const callData = mockTarget.interface.encodeFunctionData("record", [555n]);
      const duration = 300; // 5 minutes

      await multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, callData, duration);

      // Advance time beyond expiration (signer 2 was unavailable during voting window)
      await networkHelpers.time.increase(duration + 10);

      // Even if signer 2 comes back online and tries to confirm:
      await expect(multiSig.connect(owners[1]).confirmTransaction(0)).to.be.revertedWith(
        "BridgeMultiSig: proposal expired"
      );

      // And execution must fail with expired error:
      await expect(multiSig.connect(owners[0]).executeTransaction(0)).to.be.revertedWith(
        "BridgeMultiSig: proposal expired"
      );

      expect(await mockTarget.callCount()).to.equal(0);
    });
  });

  describe("Successful Execution, Value Transfers & Accounting Invariants", () => {
    it("executes successfully once threshold is met and mutates target state", async () => {
      const { multiSig, mockTarget, owners } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();
      const callData = mockTarget.interface.encodeFunctionData("record", [12345n]);

      await multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, callData, 600);
      await multiSig.connect(owners[1]).confirmTransaction(0);

      const tx = await multiSig.connect(owners[0]).executeTransaction(0);
      await expect(tx).to.emit(multiSig, "ProposalExecuted").withArgs(0, owners[0].address);

      const prop = await multiSig.proposals(0);
      expect(prop.executed).to.be.true;
      expect(await mockTarget.callCount()).to.equal(1);
      expect(await mockTarget.lastValue()).to.equal(12345n);
    });

    it("prevents replaying already executed proposal (Invariant M-1/M-2)", async () => {
      const { multiSig, mockTarget, owners } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();
      const callData = mockTarget.interface.encodeFunctionData("record", [123n]);

      await multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, callData, 600);
      await multiSig.connect(owners[1]).confirmTransaction(0);
      await multiSig.connect(owners[0]).executeTransaction(0);

      // Replay attempt must revert
      await expect(multiSig.connect(owners[0]).executeTransaction(0)).to.be.revertedWith(
        "BridgeMultiSig: proposal already executed"
      );
      await expect(multiSig.connect(owners[1]).confirmTransaction(0)).to.be.revertedWith(
        "BridgeMultiSig: proposal already executed"
      );
      await expect(multiSig.connect(owners[1]).revokeConfirmation(0)).to.be.revertedWith(
        "BridgeMultiSig: proposal already executed"
      );

      expect(await mockTarget.callCount()).to.equal(1);
    });

    it("preserves atomic rollback when target call reverts", async () => {
      const { multiSig, mockTarget, owners } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();
      const callData = mockTarget.interface.encodeFunctionData("fail", ["Simulated target error"]);

      await multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, callData, 600);
      await multiSig.connect(owners[1]).confirmTransaction(0);

      await expect(multiSig.connect(owners[0]).executeTransaction(0)).to.be.revertedWith(
        "BridgeMultiSig: transaction execution failed"
      );

      // Proposal must NOT be marked executed because the transaction reverted atomically
      expect((await multiSig.proposals(0)).executed).to.be.false;
    });

    it("executes native value transfers and maintains exact accounting balance", async () => {
      const { multiSig, owners, nonOwner } = await deployFixture(2, 3);
      const multiSigAddr = await multiSig.getAddress();

      // Fund multisig contract with 10 ETH
      const depositAmount = ethers.parseEther("10.0");
      await owners[0].sendTransaction({ to: multiSigAddr, value: depositAmount });
      expect(await ethers.provider.getBalance(multiSigAddr)).to.equal(depositAmount);

      const transferAmount = ethers.parseEther("4.5");
      const initialRecipientBal = await ethers.provider.getBalance(nonOwner.address);

      // Propose native transfer to nonOwner
      await multiSig.connect(owners[0]).proposeTransaction(nonOwner.address, transferAmount, "0x", 600);
      await multiSig.connect(owners[2]).confirmTransaction(0);

      await multiSig.connect(owners[0]).executeTransaction(0);

      // Assert solvency invariant: balance_after = balance_before - transferAmount
      expect(await ethers.provider.getBalance(multiSigAddr)).to.equal(depositAmount - transferAmount);
      expect(await ethers.provider.getBalance(nonOwner.address)).to.equal(
        initialRecipientBal + transferAmount
      );
    });

    it("rejects execution by non-owner even if threshold is met", async () => {
      const { multiSig, mockTarget, owners, attacker } = await deployFixture(2, 3);
      const targetAddr = await mockTarget.getAddress();
      const callData = mockTarget.interface.encodeFunctionData("record", [999n]);

      await multiSig.connect(owners[0]).proposeTransaction(targetAddr, 0, callData, 600);
      await multiSig.connect(owners[1]).confirmTransaction(0);

      await expect(multiSig.connect(attacker).executeTransaction(0)).to.be.revertedWith(
        "BridgeMultiSig: caller is not an owner"
      );
    });
  });
});
