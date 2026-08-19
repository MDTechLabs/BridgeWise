import { expect } from "chai";
import hre from "hardhat";

describe("FlashLoanGuardVault", () => {
  let ethers: any;
  let networkHelpers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    networkHelpers = connection.networkHelpers;
  });

  async function deploy() {
    const [admin, alice, bob] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const asset = await MockERC20.deploy("Mock USD", "mUSD");
    await asset.waitForDeployment();

    const Vault = await ethers.getContractFactory("FlashLoanGuardVault");
    const vault = await Vault.deploy(
      await asset.getAddress(),
      "Guarded LP",
      "gLP",
      admin.address
    );
    await vault.waitForDeployment();

    for (const signer of [alice, bob]) {
      await asset.mint(signer.address, ethers.parseEther("1000"));
      await asset.connect(signer).approve(await vault.getAddress(), ethers.MaxUint256);
    }

    return { vault, asset, admin, alice, bob };
  }

  it("deploys with the configured asset and LP token metadata", async () => {
    const { vault, asset } = await deploy();

    expect(await vault.asset()).to.equal(await asset.getAddress());
    expect(await vault.name()).to.equal("Guarded LP");
    expect(await vault.symbol()).to.equal("gLP");
    expect(await vault.totalAssets()).to.equal(0);
  });

  it("mints shares 1:1 for the first deposit", async () => {
    const { vault, asset, alice } = await deploy();

    const amount = ethers.parseEther("100");
    await expect(vault.connect(alice).deposit(amount))
      .to.emit(vault, "Deposited")
      .withArgs(alice.address, amount, amount);

    expect(await vault.balanceOf(alice.address)).to.equal(amount);
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(amount);
  });

  it("mints proportional shares for a subsequent depositor", async () => {
    const { vault, bob, alice } = await deploy();

    await vault.connect(alice).deposit(ethers.parseEther("100"));
    await networkHelpers.mine();

    // Vault holds 100 assets backing 100 shares, so price is still 1:1.
    await expect(vault.connect(bob).deposit(ethers.parseEther("50")))
      .to.emit(vault, "Deposited")
      .withArgs(bob.address, ethers.parseEther("50"), ethers.parseEther("50"));

    expect(await vault.totalSupply()).to.equal(ethers.parseEther("150"));
  });

  it("reverts on a zero-amount deposit", async () => {
    const { vault, alice } = await deploy();

    await expect(vault.connect(alice).deposit(0)).to.be.revertedWithCustomError(
      vault,
      "ZeroAmount"
    );
  });

  it("allows withdrawal in a later block and returns the underlying assets", async () => {
    const { vault, asset, alice } = await deploy();

    const amount = ethers.parseEther("100");
    await vault.connect(alice).deposit(amount);
    await networkHelpers.mine();

    const balanceBefore = await asset.balanceOf(alice.address);
    await expect(vault.connect(alice).withdraw(amount))
      .to.emit(vault, "Withdrawn")
      .withArgs(alice.address, amount, amount);

    expect(await vault.balanceOf(alice.address)).to.equal(0);
    expect(await asset.balanceOf(alice.address)).to.equal(balanceBefore + amount);
  });

  it("reverts a withdrawal for more shares than the caller holds", async () => {
    const { vault, alice } = await deploy();

    await vault.connect(alice).deposit(ethers.parseEther("10"));
    await networkHelpers.mine();

    await expect(
      vault.connect(alice).withdraw(ethers.parseEther("11"))
    ).to.be.revertedWithCustomError(vault, "InsufficientShares");
  });

  it("reverts on a zero-amount withdrawal", async () => {
    const { vault, alice } = await deploy();

    await vault.connect(alice).deposit(ethers.parseEther("10"));
    await networkHelpers.mine();

    await expect(vault.connect(alice).withdraw(0)).to.be.revertedWithCustomError(
      vault,
      "ZeroAmount"
    );
  });

  it("blocks a same-block deposit-then-withdraw flash loan cycle", async () => {
    const { vault, asset } = await deploy();

    const Attacker = await ethers.getContractFactory("FlashLoanAttacker");
    const attacker = await Attacker.deploy();
    await attacker.waitForDeployment();

    // Simulate flash-loaned funds arriving in the attacker contract.
    const amount = ethers.parseEther("500");
    await asset.mint(await attacker.getAddress(), amount);

    const expectedBlock = (await ethers.provider.getBlockNumber()) + 1;

    await expect(
      attacker.attack(await vault.getAddress(), await asset.getAddress(), amount)
    )
      .to.be.revertedWithCustomError(vault, "SameBlockFlashLoanCycle")
      .withArgs(await attacker.getAddress(), expectedBlock);

    // The whole cycle reverted atomically: no shares outstanding, no assets
    // absorbed by the vault, and the attacker still holds its borrowed funds.
    expect(await vault.totalSupply()).to.equal(0);
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(0);
    expect(await asset.balanceOf(await attacker.getAddress())).to.equal(amount);
  });

  it("does not block ordinary multi-block deposit and withdraw", async () => {
    const { vault, alice } = await deploy();

    const amount = ethers.parseEther("25");
    await vault.connect(alice).deposit(amount);
    await networkHelpers.mine();
    await networkHelpers.mine();

    await vault.connect(alice).withdraw(amount);
    expect(await vault.balanceOf(alice.address)).to.equal(0);
  });

  it("allows the owner to pause and unpause the vault", async () => {
    const { vault, admin, alice } = await deploy();

    await vault.connect(admin).pause();
    expect(await vault.paused()).to.equal(true);

    await expect(
      vault.connect(alice).deposit(ethers.parseEther("1"))
    ).to.be.revertedWithCustomError(vault, "EnforcedPause");

    await vault.connect(admin).unpause();
    expect(await vault.paused()).to.equal(false);

    await vault.connect(alice).deposit(ethers.parseEther("1"));
    expect(await vault.balanceOf(alice.address)).to.equal(ethers.parseEther("1"));
  });

  it("rejects pause from a non-owner", async () => {
    const { vault, alice } = await deploy();

    await expect(vault.connect(alice).pause()).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount"
    );
  });
});
