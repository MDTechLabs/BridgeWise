import { expect } from "chai";
import hre from "hardhat";

describe("FlashLoanGuard", () => {
  let ethers: any;
  let networkHelpers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    networkHelpers = connection.networkHelpers;
  });

  async function deploy() {
    const [owner, user, router] = await ethers.getSigners();
    const Guard = await ethers.getContractFactory("FlashLoanGuardHarness");
    const guard = await Guard.deploy();
    await guard.waitForDeployment();
    return { guard, owner, user, router };
  }

  it("records a deposit block", async () => {
    const { guard, user } = await deploy();

    const blockBefore = await ethers.provider.getBlockNumber();
    await expect(guard.connect(user).recordDeposit())
      .to.emit(guard, "DepositRecorded")
      .withArgs(user.address, blockBefore + 1);
  });

  it("reverts dispatch when deposit happened in the same block", async () => {
    const { guard, user } = await deploy();

    await expect(
      guard.connect(user).recordDepositAndDispatch()
    ).to.be.revertedWithCustomError(guard, "SameBlockFlashLoan").withArgs(user.address);
  });

  it("allows dispatch after advancing one block", async () => {
    const { guard, user } = await deploy();

    await guard.connect(user).recordDeposit();
    await networkHelpers.mine();

    await expect(guard.connect(user).guardedDispatch())
      .to.emit(guard, "Dispatched")
      .withArgs(user.address);
  });

  it("bypasses guard for authorized router addresses", async () => {
    const { guard, router } = await deploy();

    await guard.setBypass(router.address, true);
    expect(await guard.isBypassAuthorized(router.address)).to.equal(true);

    await guard.connect(router).recordDeposit();
    await expect(guard.connect(router).guardedDispatch())
      .to.emit(guard, "Dispatched")
      .withArgs(router.address);
  });

  it("revokes bypass authorization", async () => {
    const { guard, router } = await deploy();

    await guard.setBypass(router.address, true);
    await guard.setBypass(router.address, false);
    expect(await guard.isBypassAuthorized(router.address)).to.equal(false);

    await expect(guard.connect(router).recordDepositAndDispatch())
      .to.be.revertedWithCustomError(guard, "SameBlockFlashLoan")
      .withArgs(router.address);
  });
});
