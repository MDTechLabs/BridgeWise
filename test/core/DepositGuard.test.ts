import { expect } from "chai";
import { ethers } from "hardhat";

describe("DepositGuard", () => {
  async function deploy() {
    const [admin, user] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DepositGuard");
    const guard = await Factory.deploy(admin.address);
    await guard.waitForDeployment();
    return { guard, admin, user };
  }

  const TOKEN = "0x0000000000000000000000000000000000000001";

  it("enforces minDeposit and maxDeposit limits", async () => {
    const { guard, admin, user } = await deploy();

    await guard.connect(admin).setMinDeposit(TOKEN, 100n);
    await guard.connect(admin).setMaxDeposit(TOKEN, 1000n);

    await expect(guard.connect(user).deposit(TOKEN, 50n))
      .to.be.revertedWithCustomError(guard, "DepositTooSmall")
      .withArgs(50n, 100n);

    await expect(guard.connect(user).deposit(TOKEN, 1500n))
      .to.be.revertedWithCustomError(guard, "DepositTooLarge")
      .withArgs(1500n, 1000n);

    await expect(guard.connect(user).deposit(TOKEN, 500n))
      .to.emit(guard, "DepositProcessed")
      .withArgs(TOKEN, user.address, 500n);
  });
});
