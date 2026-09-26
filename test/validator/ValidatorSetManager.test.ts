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
    const [admin, proposer, v1, v2, v3, v4] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ValidatorSetManager");
    const EPOCH_DELAY = 3600; // 1 hour
    const OVERLAP = 7200; // 2 hours
    const mgr = await Factory.deploy(admin.address, EPOCH_DELAY, OVERLAP);
    await mgr.waitForDeployment();

    const PROPOSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROPOSER_ROLE"));
    await mgr.grantRole(PROPOSER_ROLE, proposer.address);

    return { mgr, admin, proposer, v1, v2, v3, v4, EPOCH_DELAY };
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
    const { mgr, proposer, v1, v2, EPOCH_DELAY } = await deploy();

    await mgr.connect(proposer).proposeValidatorSet([v1.address, v2.address], 2);

    // Advance time past the epoch delay
    await networkHelpers.time.increase(EPOCH_DELAY + 1);

    await expect(mgr.connect(proposer).activateValidatorSet())
      .to.emit(mgr, "ValidatorSetActivated");

    expect(await mgr.hasPendingProposal()).to.equal(false);
    expect(await mgr.activeValidatorCount()).to.equal(2);
    expect(await mgr.activeThreshold()).to.equal(2);
  });

  it("checks if a validator is in the active set", async () => {
    const { mgr, proposer, v1, v2, v3, EPOCH_DELAY } = await deploy();

    await mgr.connect(proposer).proposeValidatorSet([v1.address, v2.address], 2);
    await networkHelpers.time.increase(EPOCH_DELAY + 1);
    await mgr.connect(proposer).activateValidatorSet();

    expect(await mgr.isValidator(v1.address)).to.equal(true);
    expect(await mgr.isValidator(v2.address)).to.equal(true);
    expect(await mgr.isValidator(v3.address)).to.equal(false);
  });

  it("returns active validators as array", async () => {
    const { mgr, proposer, v1, v2, EPOCH_DELAY } = await deploy();

    await mgr.connect(proposer).proposeValidatorSet([v1.address, v2.address], 1);
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
});
