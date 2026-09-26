import { expect } from "chai";
import hre from "hardhat";

describe("DynamicFeeDistribution", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [owner, burn, treasury, relayer, payer] = await ethers.getSigners();

    // Deploy mock ERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20Fee");
    const token = await MockERC20.deploy("Test Token", "TT", ethers.parseEther("1000000"));
    await token.waitForDeployment();

    // Deploy fee distributor: 40% burn, 40% treasury, 20% relayer
    const Factory = await ethers.getContractFactory("DynamicFeeDistribution");
    const distributor = await Factory.deploy(
      owner.address,
      4000,  // burnBps
      4000,  // treasuryBps
      2000,  // relayerBps
      burn.address,
      treasury.address,
      relayer.address
    );
    await distributor.waitForDeployment();

    // Fund the payer
    await token.transfer(payer.address, ethers.parseEther("10000"));

    return { distributor, token, owner, burn, treasury, relayer, payer };
  }

  it("deploys with correct fee parameters", async () => {
    const { distributor } = await deploy();

    expect(await distributor.burnBps()).to.equal(4000);
    expect(await distributor.treasuryBps()).to.equal(4000);
    expect(await distributor.relayerBps()).to.equal(2000);
  });

  it("rejects deployment with invalid basis points", async () => {
    const [owner, burn, treasury, relayer] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DynamicFeeDistribution");

    await expect(
      Factory.deploy(owner.address, 3000, 3000, 3000, burn.address, treasury.address, relayer.address)
    ).to.be.revertedWithCustomError(Factory, "InvalidBasisPoints");
  });

  it("collects and distributes fees correctly", async () => {
    const { distributor, token, owner, burn, treasury, relayer, payer } = await deploy();
    const amount = ethers.parseEther("1000");

    // Approve and collect
    await token.connect(payer).approve(await distributor.getAddress(), amount);
    await distributor.collectFees(await token.getAddress(), payer.address, amount);

    expect(await distributor.totalFeesCollected(await token.getAddress())).to.equal(amount);

    // Distribute
    await distributor.distributeFees(await token.getAddress(), amount);

    // Check splits: 40% burn, 40% treasury, 20% relayer
    const burnBal = await token.balanceOf(burn.address);
    const treasuryBal = await token.balanceOf(treasury.address);
    const relayerBal = await token.balanceOf(relayer.address);

    expect(burnBal).to.equal(ethers.parseEther("400"));
    expect(treasuryBal).to.equal(ethers.parseEther("400"));
    expect(relayerBal).to.equal(ethers.parseEther("200"));
  });

  it("rejects zero-fee collection", async () => {
    const { distributor, token, payer } = await deploy();

    await expect(
      distributor.collectFees(await token.getAddress(), payer.address, 0)
    ).to.be.revertedWithCustomError(distributor, "ZeroFees");
  });

  it("collectAndDistribute works in one call", async () => {
    const { distributor, token, owner, burn, treasury, relayer, payer } = await deploy();
    const amount = ethers.parseEther("500");

    await token.connect(payer).approve(await distributor.getAddress(), amount);

    await distributor.collectAndDistribute(await token.getAddress(), payer.address, amount);

    const burnBal = await token.balanceOf(burn.address);
    const treasuryBal = await token.balanceOf(treasury.address);
    const relayerBal = await token.balanceOf(relayer.address);

    expect(burnBal).to.equal(ethers.parseEther("200"));
    expect(treasuryBal).to.equal(ethers.parseEther("200"));
    expect(relayerBal).to.equal(ethers.parseEther("100"));
  });

  it("owner can update fee parameters", async () => {
    const { distributor } = await deploy();

    await expect(distributor.setFeeParameters(5000, 3000, 2000))
      .to.emit(distributor, "FeeParametersUpdated")
      .withArgs(5000, 3000, 2000);

    expect(await distributor.burnBps()).to.equal(5000);
    expect(await distributor.treasuryBps()).to.equal(3000);
    expect(await distributor.relayerBps()).to.equal(2000);
  });

  it("rejects invalid fee parameter update", async () => {
    const { distributor } = await deploy();

    await expect(
      distributor.setFeeParameters(1000, 1000, 1000)
    ).to.be.revertedWithCustomError(distributor, "InvalidBasisPoints");
  });

  it("non-owner cannot distribute", async () => {
    const { distributor, token, payer } = await deploy();

    await expect(
      distributor.connect(payer).distributeFees(await token.getAddress(), 100)
    ).to.be.revertedWithCustomError(distributor, "OwnableUnauthorizedAccount");
  });
});
