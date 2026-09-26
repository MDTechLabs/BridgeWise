import { expect } from "chai";
import { ethers } from "hardhat";

describe("TimelockGuardian", () => {
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
});
