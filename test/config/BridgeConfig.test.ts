import { expect } from "chai";
import { ethers } from "hardhat";

describe("BridgeConfig", () => {
  async function deploy(targetChainId = 42161, router?: string) {
    const factory = await ethers.getContractFactory("BridgeConfig");
    const config = await factory.deploy(
      targetChainId,
      router ?? "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
    );
    await config.waitForDeployment();
    return config;
  }

  it("stores targetChainId from constructor", async () => {
    const config = await deploy(137);
    expect(await config.targetChainId()).to.equal(137n);
  });

  it("stores router address from constructor", async () => {
    const addr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const config = await deploy(1, addr);
    expect(await config.router()).to.equal(addr);
  });

  it("emits an indexed, immutable deployment manifest", async () => {
    const [deployer] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("BridgeConfig");
    const router = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

    const tx = await factory.connect(deployer).deploy(8453, router);
    const config = await tx.waitForDeployment();
    const receipt = await config.deploymentTransaction()?.wait();
    const manifest = receipt?.logs
      .map(log => {
        try { return config.interface.parseLog(log); } catch { return null; }
      })
      .find(log => log?.name === "ConfigDeployed");

    expect(manifest?.args.targetChainId).to.equal(8453n);
    expect(manifest?.args.router).to.equal(router);
    expect(await config.targetChainId()).to.equal(8453n);
    expect(await config.router()).to.equal(router);
  });

  it("reverts when router is zero address", async () => {
    const factory = await ethers.getContractFactory("BridgeConfig");
    await expect(factory.deploy(1, ethers.ZeroAddress)).to.be.reverted;
  });
});
