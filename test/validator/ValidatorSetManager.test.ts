import { expect } from "chai";
import hre from "hardhat";

describe("ValidatorSetManager", () => {
  let ethers: any;
  let networkHelpers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    networkHelpers = connection.networkHelpers;
  });

  async function deploy() {
    const [admin, proposer, v1, v2, v3, v4, approver1, approver2, approver3] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ValidatorSetManager");
    const EPOCH_DELAY = 3600; // 1 hour
    const OVERLAP = 7200; // 2 hours
    const mgr = await Factory.deploy(admin.address, EPOCH_DELAY, OVERLAP);
    await mgr.waitForDeployment();

    const PROPOSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROPOSER_ROLE"));
    await mgr.grantRole(PROPOSER_ROLE, proposer.address);

    const APPROVER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("APPROVER_ROLE"));
    await mgr.grantRole(APPROVER_ROLE, approver1.address);
    await mgr.grantRole(APPROVER_ROLE, approver2.address);
    await mgr.grantRole(APPROVER_ROLE, approver3.address);

    return { mgr, admin, proposer, v1, v2, v3, v4, approver1, approver2, approver3, EPOCH_DELAY };
  }

  it("proposes a validator set", async () => {
    const { mgr, proposer, v1, v2 } = await deploy();
    const block = await ethers.provider.getBlock("latest");

    await expect(
      mgr.connect(proposer).proposeValidatorSet([v1.address, v2.address], 2)
    ).to.emit(mgr, "ValidatorSetProposed");

    expect(await mgr.hasPendingProposal()).to.equal(true);
    expect(await mgr.pendingValidatorCount()).to.equal(2);
  });

  it("rejects empty validator set", async () => {
    const { mgr, proposer } = await deploy();

    await expect(
      mgr.connect(proposer).proposeValidatorSet([], 1)
    ).to.be.revertedWithCustomError(mgr, "EmptyValidatorSet");
  });

  it("rejects threshold > validator count", async () => {
    const { mgr, proposer, v1 } = await deploy();

    await expect(
      mgr.connect(proposer).proposeValidatorSet([v1.address], 2)
    ).to.be.revertedWithCustomError(mgr, "ThresholdExceedsCount");
  });

  it("rejects activation before timelock", async () => {
    const { mgr, proposer, v1, v2 } = await deploy();

    await mgr.connect(proposer).proposeValidatorSet([v1.address, v2.address], 2);

    await expect(
      mgr.connect(proposer).activateValidatorSet()
    ).to.be.revertedWithCustomError(mgr, "TimelockNotExpired");
  });

  it("activates after timelock expires", async () => {
    const { mgr, proposer, v1, v2, approver1, EPOCH_DELAY } = await deploy();

    await mgr.connect(proposer).proposeValidatorSet([v1.address, v2.address], 2);
    await mgr.connect(approver1).approveValidatorSet();

    // Advance time past the epoch delay
    await networkHelpers.time.increase(EPOCH_DELAY + 1);

    await expect(mgr.connect(proposer).activateValidatorSet())
      .to.emit(mgr, "ValidatorSetActivated");

    expect(await mgr.hasPendingProposal()).to.equal(false);
    expect(await mgr.activeValidatorCount()).to.equal(2);
    expect(await mgr.activeThreshold()).to.equal(2);
  });

  it("checks if a validator is in the active set", async () => {
    const { mgr, proposer, v1, v2, v3, approver1, EPOCH_DELAY } = await deploy();

    await mgr.connect(proposer).proposeValidatorSet([v1.address, v2.address], 2);
    await mgr.connect(approver1).approveValidatorSet();
    await networkHelpers.time.increase(EPOCH_DELAY + 1);
    await mgr.connect(proposer).activateValidatorSet();

    expect(await mgr.isValidator(v1.address)).to.equal(true);
    expect(await mgr.isValidator(v2.address)).to.equal(true);
    expect(await mgr.isValidator(v3.address)).to.equal(false);
  });

  it("returns active validators as array", async () => {
    const { mgr, proposer, v1, v2, approver1, EPOCH_DELAY } = await deploy();

    await mgr.connect(proposer).proposeValidatorSet([v1.address, v2.address], 1);
    await mgr.connect(approver1).approveValidatorSet();
    await networkHelpers.time.increase(EPOCH_DELAY + 1);
    await mgr.connect(proposer).activateValidatorSet();

    const validators = await mgr.getActiveValidators();
    expect(validators.length).to.equal(2);
    expect(validators[0]).to.equal(v1.address);
    expect(validators[1]).to.equal(v2.address);
  });

  it("non-proposer cannot propose", async () => {
    const { mgr, v1 } = await deploy();

    await expect(
      mgr.connect(v1).proposeValidatorSet([v1.address], 1)
    ).to.be.revertedWithCustomError(mgr, "AccessControlUnauthorizedAccount");
  });
  describe("threshold approval for replacement", () => {
    async function proposed(threshold = 2) {
      const ctx = await deploy();
      await ctx.mgr.setApprovalThreshold(threshold);
      await ctx.mgr.connect(ctx.proposer).proposeValidatorSet([ctx.v1.address, ctx.v2.address], 2);
      return ctx;
    }

    it("defaults to one required approval", async () => {
      const { mgr } = await deploy();
      expect(await mgr.approvalThreshold()).to.equal(1);
    });

    it("rejects activation with no approvals even after the timelock", async () => {
      const { mgr, proposer, EPOCH_DELAY } = await proposed();
      await networkHelpers.time.increase(EPOCH_DELAY + 1);
      await expect(mgr.connect(proposer).activateValidatorSet())
        .to.be.revertedWithCustomError(mgr, "InsufficientApprovals")
        .withArgs(0, 2);
    });

    it("rejects activation below the threshold", async () => {
      const { mgr, proposer, approver1, EPOCH_DELAY } = await proposed();
      await mgr.connect(approver1).approveValidatorSet();
      await networkHelpers.time.increase(EPOCH_DELAY + 1);
      await expect(mgr.connect(proposer).activateValidatorSet())
        .to.be.revertedWithCustomError(mgr, "InsufficientApprovals")
        .withArgs(1, 2);
    });

    it("activates once the threshold is met and the timelock has passed", async () => {
      const { mgr, proposer, approver1, approver2, EPOCH_DELAY } = await proposed();
      await mgr.connect(approver1).approveValidatorSet();
      await expect(mgr.connect(approver2).approveValidatorSet()).to.emit(mgr, "ValidatorSetApproved");
      await networkHelpers.time.increase(EPOCH_DELAY + 1);
      await expect(mgr.connect(proposer).activateValidatorSet()).to.emit(mgr, "ValidatorSetActivated");
      expect(await mgr.activeValidatorCount()).to.equal(2);
      expect(await mgr.approvalCount()).to.equal(0);
    });

    it("still enforces the timelock when approvals are complete", async () => {
      const { mgr, proposer, approver1, approver2 } = await proposed();
      await mgr.connect(approver1).approveValidatorSet();
      await mgr.connect(approver2).approveValidatorSet();
      await expect(mgr.connect(proposer).activateValidatorSet())
        .to.be.revertedWithCustomError(mgr, "TimelockNotExpired");
    });

    it("counts one approver only once", async () => {
      const { mgr, approver1 } = await proposed();
      await mgr.connect(approver1).approveValidatorSet();
      await expect(mgr.connect(approver1).approveValidatorSet())
        .to.be.revertedWithCustomError(mgr, "AlreadyApproved");
      expect(await mgr.approvalCount()).to.equal(1);
    });

    it("does not let the proposer or a stranger approve", async () => {
      const { mgr, proposer, v3 } = await proposed();
      await expect(mgr.connect(proposer).approveValidatorSet())
        .to.be.revertedWithCustomError(mgr, "AccessControlUnauthorizedAccount");
      await expect(mgr.connect(v3).approveValidatorSet())
        .to.be.revertedWithCustomError(mgr, "AccessControlUnauthorizedAccount");
    });

    it("does not let an approver propose or activate", async () => {
      const { mgr, approver1, v1 } = await proposed();
      await expect(mgr.connect(approver1).proposeValidatorSet([v1.address], 1))
        .to.be.revertedWithCustomError(mgr, "AccessControlUnauthorizedAccount");
      await expect(mgr.connect(approver1).activateValidatorSet())
        .to.be.revertedWithCustomError(mgr, "AccessControlUnauthorizedAccount");
    });

    it("rejects approval when nothing is pending", async () => {
      const { mgr, approver1 } = await deploy();
      await expect(mgr.connect(approver1).approveValidatorSet())
        .to.be.revertedWithCustomError(mgr, "NoPendingProposal");
    });

    it("discards approvals when the set is replaced by a new proposal", async () => {
      const { mgr, proposer, approver1, approver2, v1, v3, EPOCH_DELAY } = await proposed();
      await mgr.connect(approver1).approveValidatorSet();
      await mgr.connect(approver2).approveValidatorSet();

      // Swap the pending set for a different one: earlier approvals must not carry over.
      await mgr.connect(proposer).proposeValidatorSet([v1.address, v3.address], 2);
      expect(await mgr.approvalCount()).to.equal(0);
      expect(await mgr.hasApproved(approver1.address)).to.equal(false);

      await networkHelpers.time.increase(EPOCH_DELAY + 1);
      await expect(mgr.connect(proposer).activateValidatorSet())
        .to.be.revertedWithCustomError(mgr, "InsufficientApprovals")
        .withArgs(0, 2);

      // The same approver can approve the new proposal.
      await mgr.connect(approver1).approveValidatorSet();
      expect(await mgr.hasApproved(approver1.address)).to.equal(true);
    });

    it("only the admin can change the approval threshold, and never to zero", async () => {
      const { mgr, proposer } = await deploy();
      await expect(mgr.connect(proposer).setApprovalThreshold(2))
        .to.be.revertedWithCustomError(mgr, "AccessControlUnauthorizedAccount");
      await expect(mgr.setApprovalThreshold(0))
        .to.be.revertedWithCustomError(mgr, "InvalidApprovalThreshold");
      await expect(mgr.setApprovalThreshold(3)).to.emit(mgr, "ApprovalThresholdUpdated").withArgs(1, 3);
    });
  });
});
