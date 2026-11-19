import { expect } from "chai";
import hre from "hardhat";

describe("DynamicFeeDistribution partial execution accounting", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [owner, burn, treasury, relayer, payer] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockERC20Fee")).deploy(
      "Test Token",
      "TT",
      ethers.parseEther("1000000")
    );
    const distributor = await (await ethers.getContractFactory("DynamicFeeDistribution")).deploy(
      owner.address, 4000, 4000, 2000, burn.address, treasury.address, relayer.address
    );
    await token.transfer(payer.address, 1_000_000n);
    await token.connect(payer).approve(await distributor.getAddress(), 1_000_000n);
    return { distributor, token, burn, treasury, relayer, payer };
  }

  it("conserves every unit across odd-sized partial distributions", async () => {
    const { distributor, token, burn, treasury, relayer, payer } = await deploy();
    const tokenAddr = await token.getAddress();
    const distAddr = await distributor.getAddress();

    await distributor.collectFees(tokenAddr, payer.address, 1001n);

    // Odd amounts force rounding; the relayer share absorbs the remainder.
    for (const amount of [1n, 3n, 7n, 333n]) {
      await distributor.distributeFees(tokenAddr, amount);
    }

    const paidOut =
      (await token.balanceOf(burn.address)) +
      (await token.balanceOf(treasury.address)) +
      (await token.balanceOf(relayer.address));
    const distributed = await distributor.totalFeesDistributed(tokenAddr);
    const collected = await distributor.totalFeesCollected(tokenAddr);

    expect(distributed).to.equal(344n);
    expect(paidOut).to.equal(distributed);
    expect(await token.balanceOf(distAddr)).to.equal(collected - distributed);
  });

  it("leaves accounting untouched when a distribution exceeds the undistributed remainder", async () => {
    const { distributor, token, payer } = await deploy();
    const tokenAddr = await token.getAddress();

    await distributor.collectFees(tokenAddr, payer.address, 100n);
    await distributor.distributeFees(tokenAddr, 60n);

    await expect(distributor.distributeFees(tokenAddr, 41n))
      .to.be.revertedWithCustomError(distributor, "InsufficientUndistributedFees")
      .withArgs(41n, 40n);

    expect(await distributor.totalFeesDistributed(tokenAddr)).to.equal(60n);
    expect(await token.balanceOf(await distributor.getAddress())).to.equal(40n);

    // The remainder can still be fully drained.
    await distributor.distributeFees(tokenAddr, 40n);
    expect(await token.balanceOf(await distributor.getAddress())).to.equal(0n);
  });
});
