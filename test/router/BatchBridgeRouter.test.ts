import { expect } from "chai";
import hre from "hardhat";

describe("BatchBridgeRouter", () => {
  let ethers: any;
  let RECIPIENT_A: string;
  let RECIPIENT_B: string;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    RECIPIENT_A = ethers.zeroPadValue("0xaaaa", 32);
    RECIPIENT_B = ethers.zeroPadValue("0xbbbb", 32);
  });

  const DEST_CHAIN_A = 1;
  const DEST_CHAIN_B = 2;

  async function deploy() {
    const [owner, user] = await ethers.getSigners();

    const VaultFactory = await ethers.getContractFactory("MockBridgeVault");
    const vault = await VaultFactory.deploy();
    await vault.waitForDeployment();

    const RouterFactory = await ethers.getContractFactory("BatchBridgeRouter");
    const router = await RouterFactory.deploy(await vault.getAddress());
    await router.waitForDeployment();

    const TokenFactory = await ethers.getContractFactory("MockERC20");
    const tokenA = await TokenFactory.deploy("Token A", "TKA");
    await tokenA.waitForDeployment();
    const tokenB = await TokenFactory.deploy("Token B", "TKB");
    await tokenB.waitForDeployment();

    return { router, vault, tokenA, tokenB, owner, user };
  }

  it("processes multi-asset deposits atomically", async () => {
    const { router, vault, tokenA, tokenB, user } = await deploy();

    const amountA = ethers.parseEther("1.5");
    const amountB = ethers.parseEther("2.5");

    await tokenA.mint(user.address, amountA);
    await tokenB.mint(user.address, amountB);
    await tokenA.connect(user).approve(await router.getAddress(), amountA);
    await tokenB.connect(user).approve(await router.getAddress(), amountB);

    const tokenAAddr = await tokenA.getAddress();
    const tokenBAddr = await tokenB.getAddress();
    const expectedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint256[]", "uint32[]", "bytes32[]"],
      [
        [tokenAAddr, tokenBAddr],
        [amountA, amountB],
        [DEST_CHAIN_A, DEST_CHAIN_B],
        [RECIPIENT_A, RECIPIENT_B],
      ]
    );

    await expect(
      router.connect(user).batchDeposit(
        [tokenAAddr, tokenBAddr],
        [amountA, amountB],
        [DEST_CHAIN_A, DEST_CHAIN_B],
        [RECIPIENT_A, RECIPIENT_B]
      )
    )
      .to.emit(router, "BatchBridgeDispatched")
      .withArgs(user.address, 2n, amountA + amountB, expectedPayload);

    expect(await vault.recordCount()).to.equal(2n);
    expect(await tokenA.balanceOf(await vault.getAddress())).to.equal(amountA);
    expect(await tokenB.balanceOf(await vault.getAddress())).to.equal(amountB);
  });

  it("reverts the entire batch when any transfer fails", async () => {
    const { router, vault, tokenA, tokenB, user } = await deploy();

    const amountA = ethers.parseEther("1");
    const amountB = ethers.parseEther("1");

    await tokenA.mint(user.address, amountA);
    await tokenB.mint(user.address, amountB);
    await tokenA.connect(user).approve(await router.getAddress(), amountA);
    // Do not approve tokenB.

    await expect(
      router.connect(user).batchDeposit(
        [await tokenA.getAddress(), await tokenB.getAddress()],
        [amountA, amountB],
        [DEST_CHAIN_A, DEST_CHAIN_B],
        [RECIPIENT_A, RECIPIENT_B]
      )
    ).to.revert(ethers);

    expect(await vault.recordCount()).to.equal(0n);
  });

  it("reverts on array length mismatch", async () => {
    const { router, tokenA, user } = await deploy();

    await expect(
      router.connect(user).batchDeposit(
        [await tokenA.getAddress()],
        [ethers.parseEther("1"), ethers.parseEther("1")],
        [DEST_CHAIN_A],
        [RECIPIENT_A]
      )
    ).to.be.revertedWithCustomError(router, "LengthMismatch");
  });

  it("reverts on empty batch", async () => {
    const { router, user } = await deploy();

    await expect(
      router.connect(user).batchDeposit([], [], [], [])
    ).to.be.revertedWithCustomError(router, "EmptyBatch");
  });
});
