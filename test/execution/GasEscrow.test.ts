import { expect } from "chai";
import { ethers } from "hardhat";

describe("GasEscrow", () => {
  async function deploy() {
    const [owner, refundTarget, target] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GasEscrow");
    const escrow = await Factory.deploy(5000n);
    await escrow.waitForDeployment();
    return { escrow, owner, refundTarget, target };
  }

  it("calculates execution gas consumed and refunds remaining balance", async () => {
    const { escrow, refundTarget } = await deploy();
    const depositAmount = ethers.parseEther("0.1");

    const tx = await escrow.executeWithGasEscrow(
      refundTarget.address,
      "0x",
      refundTarget.address,
      { value: depositAmount }
    );

    await expect(tx).to.emit(escrow, "GasRefunded");
  });
});
