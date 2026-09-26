import { expect } from "chai";
import hre from "hardhat";

describe("BridgePausable", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [owner] = await ethers.getSigners();
    const Harness = await ethers.getContractFactory("BridgePausableHarness");
    const harness = await Harness.deploy();
    await harness.waitForDeployment();
    return { harness, owner };
  }

  it("starts unpaused", async () => {
    const { harness } = await deploy();
    expect(await harness.paused()).to.equal(false);
  });

  it("emits Paused and toggles state", async () => {
    const { harness } = await deploy();
    await expect(harness.pause()).to.emit(harness, "Paused");
    expect(await harness.paused()).to.equal(true);
  });

  it("emits Unpaused and toggles state", async () => {
    const { harness } = await deploy();
    await harness.pause();
    await expect(harness.unpause()).to.emit(harness, "Unpaused");
    expect(await harness.paused()).to.equal(false);
  });

  it("reverts pausable entry with BridgePaused when paused", async () => {
    const { harness } = await deploy();
    await harness.pause();
    await expect(harness.ping()).to.be.revertedWithCustomError(harness, "BridgePaused");
  });

  it("allows entry after unpause", async () => {
    const { harness } = await deploy();
    await harness.pause();
    await harness.unpause();
    await expect(harness.ping()).to.emit(harness, "Ping");
  });

  it("reverts whenNotPaused entry with BridgeNotPaused when not paused", async () => {
    const { harness } = await deploy();
    await expect(harness.pong()).to.be.revertedWithCustomError(harness, "BridgeNotPaused");
  });

  it("allows whenPaused entry when paused", async () => {
    const { harness } = await deploy();
    await harness.pause();
    await expect(harness.pong()).to.emit(harness, "Ping");
  });
});
