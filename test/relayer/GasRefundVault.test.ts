import { expect } from "chai";
import hre from "hardhat";

describe("GasRefundVault", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [admin, guardian, relayer, unauthorized, user] = await ethers.getSigners();

    // Deploy mock target contract for execution tests
    const MockTarget = await ethers.getContractFactory("MockGasTarget");
    const target = await MockTarget.deploy();
    await target.waitForDeployment();

    // Deploy GasRefundVault
    const overhead = 50000; // 50k gas overhead
    const maxRefundPerTx = ethers.parseEther("1"); // 1 ETH max refund
    const Vault = await ethers.getContractFactory("GasRefundVault");
    const vault = await Vault.deploy(
      admin.address,
      guardian.address,
      relayer.address,
      overhead,
      maxRefundPerTx
    );
    await vault.waitForDeployment();

    // Fund the vault
    await vault.connect(user).sendTransaction({ value: ethers.parseEther("10") });

    return { vault, target, admin, guardian, relayer, unauthorized, user, overhead, maxRefundPerTx };
  }

  it("deploys with correct parameters", async () => {
    const { vault, overhead, maxRefundPerTx } = await deploy();

    expect(await vault.overhead()).to.equal(overhead);
    expect(await vault.maxRefundPerTx()).to.equal(maxRefundPerTx);
    expect(await vault.totalGasRefunded()).to.equal(0);
    expect(await vault.totalNativeDisbursed()).to.equal(0);
  });

  it("grants correct roles on deployment", async () => {
    const { vault, admin, guardian, relayer, unauthorized } = await deploy();

    const RELAYER_ROLE = await vault.RELAYER_ROLE();
    const GUARDIAN_ROLE = await vault.GUARDIAN_ROLE();
    const DEFAULT_ADMIN_ROLE = await vault.DEFAULT_ADMIN_ROLE();

    expect(await vault.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    expect(await vault.hasRole(GUARDIAN_ROLE, guardian.address)).to.be.true;
    expect(await vault.hasRole(RELAYER_ROLE, relayer.address)).to.be.true;
    expect(await vault.hasRole(RELAYER_ROLE, unauthorized.address)).to.be.false;
  });

  it("accepts native token deposits via receive", async () => {
    const { vault, user } = await deploy();

    const depositAmount = ethers.parseEther("5");
    await expect(
      vault.connect(user).sendTransaction({ value: depositAmount })
    ).to.emit(vault, "VaultDeposited")
      .withArgs(user.address, depositAmount);

    expect(await vault.getVaultBalance()).to.be.greaterThan(ethers.parseEther("10"));
  });

  it("allows authorized relayer to execute with gas refund", async () => {
    const { vault, target, relayer } = await deploy();

    const tx = await vault.connect(relayer).executeWithGasRefund(
      await target.getAddress(),
      target.interface.encodeFunctionData("simpleCall", [])
    );

    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);

    // Verify accounting updated
    expect(await vault.totalGasRefunded()).to.be.greaterThan(0);
    expect(await vault.totalNativeDisbursed()).to.be.greaterThan(0);

    // Verify relayer stats updated
    const [gasRefunded, nativeDisbursed] = await vault.getRelayerStats(relayer.address);
    expect(gasRefunded).to.be.greaterThan(0);
    expect(nativeDisbursed).to.be.greaterThan(0);
  });

  it("emits GasRefunded event on successful execution", async () => {
    const { vault, target, relayer } = await deploy();

    const tx = await vault.connect(relayer).executeWithGasRefund(
      await target.getAddress(),
      target.interface.encodeFunctionData("simpleCall", [])
    );

    await expect(tx)
      .to.emit(vault, "GasRefunded")
      .withArgs(relayer.address, await vault.totalGasRefunded(), await hre.ethers.provider.get("gasPrice"), await vault.totalNativeDisbursed());
  });

  it("rejects execution from unauthorized relayer", async () => {
    const { vault, target, unauthorized } = await deploy();

    await expect(
      vault.connect(unauthorized).executeWithGasRefund(
        await target.getAddress(),
        target.interface.encodeFunctionData("simpleCall", [])
      )
    ).to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
  });

  it("rejects execution when contract is paused", async () => {
    const { vault, target, relayer, guardian } = await deploy();

    await vault.connect(guardian).pause();

    await expect(
      vault.connect(relayer).executeWithGasRefund(
        await target.getAddress(),
        target.interface.encodeFunctionData("simpleCall", [])
      )
    ).to.be.revertedWithCustomError(vault, "EnforcedPause");
  });

  it("enforces maximum refund ceiling", async () => {
    const { vault, target, relayer, admin } = await deploy();

    // Set a very low max refund
    const lowMaxRefund = ethers.parseEther("0.0001");
    await vault.connect(admin).setMaxRefundPerTx(lowMaxRefund);

    const balanceBefore = await ethers.provider.getBalance(relayer.address);

    await vault.connect(relayer).executeWithGasRefund(
      await target.getAddress(),
      target.interface.encodeFunctionData("simpleCall", [])
    );

    const balanceAfter = await ethers.provider.getBalance(relayer.address);
    const refundReceived = balanceAfter - balanceBefore;

    // Refund should not exceed the low maximum
    expect(refundReceived).to.be.lessThanOrEqual(lowMaxRefund);
  });

  it("reverts when vault has insufficient balance", async () => {
    const { vault, target, relayer, admin } = await deploy();

    // Set max refund higher than vault balance
    const highMaxRefund = ethers.parseEther("100");
    await vault.connect(admin).setMaxRefundPerTx(highMaxRefund);

    // Withdraw all funds from vault
    await vault.connect(admin).executeWithGasRefund(
      await target.getAddress(),
      target.interface.encodeFunctionData("simpleCall", [])
    );

    // Try to execute again - should fail due to insufficient balance
    await expect(
      vault.connect(relayer).executeWithGasRefund(
        await target.getAddress(),
        target.interface.encodeFunctionData("simpleCall", [])
      )
    ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
  });

  it("allows relayer to claim manual gas refund", async () => {
    const { vault, relayer } = await deploy();

    const gasUsed = 100000;
    const gasPrice = await hre.ethers.provider.get("gasPrice");
    const expectedRefund = gasUsed * gasPrice;

    const balanceBefore = await ethers.provider.getBalance(relayer.address);

    const tx = await vault.connect(relayer).claimGasRefund(gasUsed, gasPrice);
    const receipt = await tx.wait();

    const balanceAfter = await ethers.provider.getBalance(relayer.address);
    const gasCost = receipt.gasUsed * receipt.gasPrice;
    const refundReceived = balanceAfter - balanceBefore + gasCost;

    expect(refundReceived).to.equal(expectedRefund);
  });

  it("enforces max refund on manual claims", async () => {
    const { vault, relayer, admin } = await deploy();

    const lowMaxRefund = ethers.parseEther("0.0001");
    await vault.connect(admin).setMaxRefundPerTx(lowMaxRefund);

    const gasUsed = 10000000;
    const gasPrice = await hre.ethers.provider.get("gasPrice");

    const balanceBefore = await ethers.provider.getBalance(relayer.address);

    await vault.connect(relayer).claimGasRefund(gasUsed, gasPrice);

    const balanceAfter = await ethers.provider.getBalance(relayer.address);
    const refundReceived = balanceAfter - balanceBefore;

    expect(refundReceived).to.be.lessThanOrEqual(lowMaxRefund);
  });

  it("rejects manual claim from unauthorized relayer", async () => {
    const { vault, unauthorized } = await deploy();

    await expect(
      vault.connect(unauthorized).claimGasRefund(100000, await hre.ethers.provider.get("gasPrice"))
    ).to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
  });

  it("rejects manual claim when paused", async () => {
    const { vault, relayer, guardian } = await deploy();

    await vault.connect(guardian).pause();

    await expect(
      vault.connect(relayer).claimGasRefund(100000, await hre.ethers.provider.get("gasPrice"))
    ).to.be.revertedWithCustomError(vault, "EnforcedPause");
  });

  it("allows admin to update max refund per tx", async () => {
    const { vault, admin } = await deploy();

    const newMaxRefund = ethers.parseEther("2");
    await expect(vault.connect(admin).setMaxRefundPerTx(newMaxRefund))
      .to.emit(vault, "MaxRefundUpdated");

    expect(await vault.maxRefundPerTx()).to.equal(newMaxRefund);
  });

  it("rejects max refund update from non-admin", async () => {
    const { vault, relayer } = await deploy();

    await expect(
      vault.connect(relayer).setMaxRefundPerTx(ethers.parseEther("2"))
    ).to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
  });

  it("allows guardian to pause the contract", async () => {
    const { vault, guardian } = await deploy();

    await expect(vault.connect(guardian).pause())
      .to.emit(vault, "Paused")
      .withArgs(await vault.getAddress());

    expect(await vault.paused()).to.be.true;
  });

  it("allows guardian to unpause the contract", async () => {
    const { vault, guardian } = await deploy();

    await vault.connect(guardian).pause();

    await expect(vault.connect(guardian).unpause())
      .to.emit(vault, "Unpaused")
      .withArgs(await vault.getAddress());

    expect(await vault.paused()).to.be.false;
  });

  it("rejects pause from non-guardian", async () => {
    const { vault, relayer } = await deploy();

    await expect(
      vault.connect(relayer).pause()
    ).to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
  });

  it("returns correct vault balance", async () => {
    const { vault, user } = await deploy();

    const depositAmount = ethers.parseEther("3");
    await vault.connect(user).sendTransaction({ value: depositAmount });

    expect(await vault.getVaultBalance()).to.be.greaterThanOrEqual(depositAmount);
  });

  it("returns correct relayer statistics", async () => {
    const { vault, target, relayer } = await deploy();

    await vault.connect(relayer).executeWithGasRefund(
      await target.getAddress(),
      target.interface.encodeFunctionData("simpleCall", [])
    );

    const [gasRefunded, nativeDisbursed] = await vault.getRelayerStats(relayer.address);

    expect(gasRefunded).to.be.greaterThan(0);
    expect(nativeDisbursed).to.be.greaterThan(0);

    // Verify matches global totals
    expect(gasRefunded).to.equal(await vault.totalGasRefunded());
    expect(nativeDisbursed).to.equal(await vault.totalNativeDisbursed());
  });

  it("handles failed target call gracefully", async () => {
    const { vault, target, relayer } = await deploy();

    // Call a function that reverts
    await expect(
      vault.connect(relayer).executeWithGasRefund(
        await target.getAddress(),
        target.interface.encodeFunctionData("revertingCall", [])
      )
    ).to.not.be.reverted;

    // Should still refund gas even if target call fails
    expect(await vault.totalGasRefunded()).to.be.greaterThan(0);
  });

  it("tracks per-relayer statistics correctly", async () => {
    const { vault, target, admin, relayer } = await deploy();

    // Grant relayer role to admin as second relayer
    const RELAYER_ROLE = await vault.RELAYER_ROLE();
    await vault.connect(admin).grantRole(RELAYER_ROLE, admin.address);

    // First relayer executes
    await vault.connect(relayer).executeWithGasRefund(
      await target.getAddress(),
      target.interface.encodeFunctionData("simpleCall", [])
    );

    const [relayer1Gas, relayer1Native] = await vault.getRelayerStats(relayer.address);

    // Second relayer executes
    await vault.connect(admin).executeWithGasRefund(
      await target.getAddress(),
      target.interface.encodeFunctionData("simpleCall", [])
    );

    const [relayer2Gas, relayer2Native] = await vault.getRelayerStats(admin.address);

    // Both should have non-zero stats
    expect(relayer1Gas).to.be.greaterThan(0);
    expect(relayer1Native).to.be.greaterThan(0);
    expect(relayer2Gas).to.be.greaterThan(0);
    expect(relayer2Native).to.be.greaterThan(0);

    // Total should be sum of both
    const totalGas = await vault.totalGasRefunded();
    const totalNative = await vault.totalNativeDisbursed();

    expect(totalGas).to.equal(relayer1Gas + relayer2Gas);
    expect(totalNative).to.equal(relayer1Native + relayer2Native);
  });
});
