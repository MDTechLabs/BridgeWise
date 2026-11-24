import { expect } from "chai";
import hre from "hardhat";

describe("TimelockGuardian", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [admin, guardian, user] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TimelockGuardian");
    const contract = await Factory.deploy(admin.address, guardian.address);
    await contract.waitForDeployment();
    return { contract, admin, guardian, user };
  }

  it("allows guardian role to cancel upgrade proposal", async () => {
    const { contract, admin, guardian } = await deploy();
    const proposalId = ethers.id("upgrade-v2");

    await contract.connect(admin).queueUpgrade(proposalId);
    expect(await contract.isProposalPending(proposalId)).to.equal(true);

    await expect(contract.connect(guardian).cancelUpgrade(proposalId))
      .to.emit(contract, "UpgradeCanceled");

    expect(await contract.isProposalPending(proposalId)).to.equal(false);
    expect(await contract.isProposalCanceled(proposalId)).to.equal(true);
  });

  it("reverts when non-guardian attempts cancellation", async () => {
    const { contract, admin, user } = await deploy();
    const proposalId = ethers.id("upgrade-v2");

    await contract.connect(admin).queueUpgrade(proposalId);

    await expect(contract.connect(user).cancelUpgrade(proposalId))
      .to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
  });

  it("does not permit a cancelled proposal to be cancelled twice", async () => {
    const { contract, admin, guardian } = await deploy();
    const proposalId = ethers.id("upgrade-v3");
    await contract.connect(admin).queueUpgrade(proposalId);
    await contract.connect(guardian).cancelUpgrade(proposalId);

    await expect(contract.connect(guardian).cancelUpgrade(proposalId))
      .to.be.revertedWith("Proposal not pending");
    expect(await contract.isProposalCanceled(proposalId)).to.equal(true);
  });
});
