import { expect } from "chai";
import { ethers } from "hardhat";

describe("BridgeOwnable", () => {
  async function deploy() {
    const [owner, pendingOwner, user] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BridgeOwnable");
    const contract = await Factory.deploy(owner.address);
    await contract.waitForDeployment();
    return { contract, owner, pendingOwner, user };
  }

  it("requires pending owner to acceptOwnership to finalize transfer", async () => {
    const { contract, owner, pendingOwner } = await deploy();

    await contract.connect(owner).transferOwnership(pendingOwner.address);
    expect(await contract.pendingOwner()).to.equal(pendingOwner.address);

    await contract.connect(pendingOwner).acceptOwnership();
    expect(await contract.owner()).to.equal(pendingOwner.address);
  });

  it("allows current owner to cancel pending ownership transfer", async () => {
    const { contract, owner, pendingOwner } = await deploy();

    await contract.connect(owner).transferOwnership(pendingOwner.address);
    await contract.connect(owner).cancelOwnershipTransfer();
    expect(await contract.pendingOwner()).to.equal(ethers.ZeroAddress);
  });
});
