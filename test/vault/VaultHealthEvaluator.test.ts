import { expect } from "chai";
import hre from "hardhat";

describe("VaultHealthEvaluator", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [admin, vaultAddr] = await ethers.getSigners();

    const Evaluator = await ethers.getContractFactory("VaultHealthEvaluator");
    const evaluator = await Evaluator.deploy();
    await evaluator.waitForDeployment();

    const ReserveVault = await ethers.getContractFactory("MockReserveVault");
    const reserveVault = await ReserveVault.deploy();
    await reserveVault.waitForDeployment();

    const Token = await ethers.getContractFactory("BridgeWrappedToken");
    const token = await Token.deploy("Bridged USDC", "bwUSDC", vaultAddr.address, admin.address);
    await token.waitForDeployment();

    return { evaluator, reserveVault, token, admin, vaultAddr };
  }

  it("returns SOLVENT when reserves equal or exceed minted supply", async () => {
    const { evaluator, reserveVault, token, vaultAddr } = await deploy();

    await token.connect(vaultAddr).mint(ethers.getAddress(ethers.hexlify(ethers.randomBytes(20))), ethers.parseEther("1"));
    await reserveVault.setLockedReserves(await token.getAddress(), ethers.parseEther("1.2"));

    const [ratio, status] = await evaluator.evaluate(
      await reserveVault.getAddress(),
      await token.getAddress()
    );

    expect(ratio).to.equal(12_000n); // 120% in bps
    expect(status).to.equal(0); // SOLVENT
  });

  it("returns UNDERCOLLATERALIZED when ratio is between 80% and 100%", async () => {
    const { evaluator, reserveVault, token, vaultAddr } = await deploy();

    await token.connect(vaultAddr).mint(ethers.getAddress(ethers.hexlify(ethers.randomBytes(20))), ethers.parseEther("1"));
    await reserveVault.setLockedReserves(await token.getAddress(), ethers.parseEther("0.9"));

    const [ratio, status] = await evaluator.evaluate(
      await reserveVault.getAddress(),
      await token.getAddress()
    );

    expect(ratio).to.equal(9_000n); // 90% in bps
    expect(status).to.equal(1); // UNDERCOLLATERALIZED
  });

  it("returns CRITICAL when ratio is below 80%", async () => {
    const { evaluator, reserveVault, token, vaultAddr } = await deploy();

    await token.connect(vaultAddr).mint(ethers.getAddress(ethers.hexlify(ethers.randomBytes(20))), ethers.parseEther("1"));
    await reserveVault.setLockedReserves(await token.getAddress(), ethers.parseEther("0.5"));

    const [ratio, status] = await evaluator.evaluate(
      await reserveVault.getAddress(),
      await token.getAddress()
    );

    expect(ratio).to.equal(5_000n); // 50% in bps
    expect(status).to.equal(2); // CRITICAL
  });

  it("returns zero ratio and SOLVENT when no wrapped tokens are minted", async () => {
    const { evaluator, reserveVault, token } = await deploy();

    await reserveVault.setLockedReserves(await token.getAddress(), ethers.parseEther("100"));

    const [ratio, status] = await evaluator.evaluate(
      await reserveVault.getAddress(),
      await token.getAddress()
    );

    expect(ratio).to.equal(0n);
    expect(status).to.equal(0); // SOLVENT
  });
});
