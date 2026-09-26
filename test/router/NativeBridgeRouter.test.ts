import { expect } from "chai";
import { ethers } from "hardhat";

describe("NativeBridgeRouter", () => {
  const DEST_CHAIN = 1;
  const RECIPIENT = ethers.zeroPadValue("0xabcdef", 32);

  async function deploy() {
    const [owner, user] = await ethers.getSigners();

    // Deploy mock WETH
    const WETHFactory = await ethers.getContractFactory("BridgeWrappedToken");
    const weth = await WETHFactory.deploy("Wrapped ETH", "WETH", owner.address);
    await weth.waitForDeployment();

    // Deploy mock vault (we'll use a simple receiver that accepts lock calls)
    const VaultFactory = await ethers.getContractFactory("BridgeReceiverBase");
    const vault = await VaultFactory.deploy(owner.address, owner.address);
    await vault.waitForDeployment();

    // Deploy router
    const RouterFactory = await ethers.getContractFactory("NativeBridgeRouter");
    const router = await RouterFactory.deploy(
      await weth.getAddress(),
      await vault.getAddress()
    );
    await router.waitForDeployment();

    return { router, weth, vault, owner, user };
  }

  it("wraps native ETH and forwards to vault on depositNative", async () => {
    const { router, weth, vault, user } = await deploy();
    const amount = ethers.parseEther("1.0");

    await router.connect(user).depositNative(DEST_CHAIN, RECIPIENT, { value: amount });

    // Router should have no WETH left (it forwarded to vault)
    expect(await weth.balanceOf(await router.getAddress())).to.equal(0);
  });

  it("emits NativeBridged event", async () => {
    const { router, user } = await deploy();
    const amount = ethers.parseEther("0.5");

    await expect(
      router.connect(user).depositNative(DEST_CHAIN, RECIPIENT, { value: amount })
    )
      .to.emit(router, "NativeBridged")
      .withArgs(DEST_CHAIN, user.address, amount, RECIPIENT);
  });

  it("reverts on zero value", async () => {
    const { router, user } = await deploy();

    await expect(
      router.connect(user).depositNative(DEST_CHAIN, RECIPIENT, { value: 0 })
    ).to.be.revertedWith("NativeBridgeRouter: zero value");
  });

  it("accepts native ETH via receive()", async () => {
    const { router, owner } = await deploy();
    const amount = ethers.parseEther("1.0");

    await owner.sendTransaction({ to: await router.getAddress(), value: amount });
    const balance = await ethers.provider.getBalance(await router.getAddress());
    expect(balance).to.equal(amount);
  });
});
