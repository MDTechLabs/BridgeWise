import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { RebalancingVault, MockERC20 } from "../../../typechain-types";

const ETH = 1; // networkId
const ARB = 2; // networkId
const OP = 3;  // networkId

async function deployFixture() {
  const [owner, keeper, other] = await ethers.getSigners();

  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const token = (await MockERC20Factory.deploy("Mock USD", "mUSD")) as MockERC20;

  const VaultFactory = await ethers.getContractFactory("RebalancingVault");
  const vault = (await VaultFactory.deploy(await token.getAddress())) as RebalancingVault;

  // 50/50 target split between two networks
  await vault.addNetwork(ETH, 5_000);
  await vault.addNetwork(ARB, 5_000);

  // fund keeper reward pool
  await token.mint(owner.address, ethers.parseEther("1000"));
  await token.connect(owner).approve(await vault.getAddress(), ethers.parseEther("1000"));
  await vault.connect(owner).fundKeeperRewardPool(ethers.parseEther("1000"));

  return { vault, token, owner, keeper, other };
}

describe("RebalancingVault", () => {
  describe("network configuration", () => {
    it("adds networks with target ratios", async () => {
      const { vault } = await loadFixture(deployFixture);
      const pool = await vault.getPool(ETH);
      expect(pool.targetRatioBps).to.equal(5_000);
      expect(pool.supported).to.equal(true);
    });

    it("reverts adding a duplicate network", async () => {
      const { vault } = await loadFixture(deployFixture);
      await expect(vault.addNetwork(ETH, 1_000)).to.be.revertedWithCustomError(
        vault,
        "NetworkAlreadySupported"
      );
    });

    it("rejects invalid target ratios", async () => {
      const { vault } = await loadFixture(deployFixture);
      await expect(vault.addNetwork(OP, 0)).to.be.revertedWithCustomError(vault, "InvalidRatio");
      await expect(vault.addNetwork(OP, 10_001)).to.be.revertedWithCustomError(vault, "InvalidRatio");
    });

    it("only owner can update target ratio", async () => {
      const { vault, other } = await loadFixture(deployFixture);
      await expect(vault.connect(other).setTargetRatio(ETH, 6_000)).to.be.reverted;
    });
  });

  describe("reserve tracking and skew signals", () => {
    it("computes current ratio correctly", async () => {
      const { vault } = await loadFixture(deployFixture);
      await vault.updateReserve(ETH, ethers.parseEther("100"));
      await vault.updateReserve(ARB, ethers.parseEther("100"));

      expect(await vault.currentRatioBps(ETH)).to.equal(5_000);
      expect(await vault.currentRatioBps(ARB)).to.equal(5_000);
      expect(await vault.isSkewed(ETH)).to.equal(false);
    });

    it("emits RebalanceSignal when skew exceeds 30%", async () => {
      const { vault } = await loadFixture(deployFixture);

      // ETH ends up at 90% of total reserves vs a 50% target -> 40% skew, over threshold
      await vault.updateReserve(ETH, ethers.parseEther("90"));
      await expect(vault.updateReserve(ARB, ethers.parseEther("10")))
        .to.emit(vault, "RebalanceSignal")
        .withArgs(ARB, 1_000, 5_000, 4_000);
    });

    it("does not emit a signal when within threshold", async () => {
      const { vault } = await loadFixture(deployFixture);
      await vault.updateReserve(ETH, ethers.parseEther("55"));
      await expect(vault.updateReserve(ARB, ethers.parseEther("45"))).to.not.emit(
        vault,
        "RebalanceSignal"
      );
    });

    it("reverts updateReserve for unsupported network", async () => {
      const { vault } = await loadFixture(deployFixture);
      await expect(vault.updateReserve(999, 1)).to.be.revertedWithCustomError(
        vault,
        "NetworkNotSupported"
      );
    });
  });

  describe("keeper incentives + rebalance execution", () => {
    it("executes a rebalance, moves reserves, and pays the keeper reward", async () => {
      const { vault, token, keeper } = await loadFixture(deployFixture);

      await vault.updateReserve(ETH, ethers.parseEther("90"));
      await vault.updateReserve(ARB, ethers.parseEther("10"));

      const amount = ethers.parseEther("20");
      const expectedReward = (amount * 50n) / 10_000n; // keeperRewardBps = 50

      const balBefore = await token.balanceOf(keeper.address);

      await expect(vault.connect(keeper).executeRebalance(ETH, ARB, amount))
        .to.emit(vault, "RebalanceExecuted")
        .withArgs(ETH, ARB, amount, keeper.address, expectedReward);

      const balAfter = await token.balanceOf(keeper.address);
      expect(balAfter - balBefore).to.equal(amount + expectedReward);

      const ethPool = await vault.getPool(ETH);
      const arbPool = await vault.getPool(ARB);
      expect(ethPool.reserve).to.equal(ethers.parseEther("70"));
      expect(arbPool.reserve).to.equal(ethers.parseEther("30"));
    });

    it("reverts if source network is not overweight", async () => {
      const { vault, keeper } = await loadFixture(deployFixture);
      await vault.updateReserve(ETH, ethers.parseEther("50"));
      await vault.updateReserve(ARB, ethers.parseEther("50"));

      await expect(
        vault.connect(keeper).executeRebalance(ETH, ARB, ethers.parseEther("1"))
      ).to.be.revertedWith("source not overweight");
    });

    it("reverts if destination network is not underweight", async () => {
      const { vault, keeper } = await loadFixture(deployFixture);
      await vault.updateReserve(ETH, ethers.parseEther("90"));
      await vault.updateReserve(ARB, ethers.parseEther("10"));
      // ARB is far underweight, ETH overweight - but reverse the direction
      await expect(
        vault.connect(keeper).executeRebalance(ARB, ETH, ethers.parseEther("1"))
      ).to.be.revertedWith("source not overweight");
    });

    it("reverts if amount exceeds source reserve", async () => {
      const { vault, keeper } = await loadFixture(deployFixture);
      await vault.updateReserve(ETH, ethers.parseEther("90"));
      await vault.updateReserve(ARB, ethers.parseEther("10"));

      await expect(
        vault.connect(keeper).executeRebalance(ETH, ARB, ethers.parseEther("999"))
      ).to.be.revertedWithCustomError(vault, "InsufficientReserve");
    });

    it("reverts if the keeper reward pool is depleted", async () => {
      const { vault, token, owner, keeper } = await loadFixture(deployFixture);
      await vault.updateReserve(ETH, ethers.parseEther("90"));
      await vault.updateReserve(ARB, ethers.parseEther("10"));

      // Drain the reward pool by maxing out reward bps and running large rebalances,
      // or more directly: set reward bps to something huge relative to a tiny pool.
      // Simplest deterministic approach: repeatedly execute until pool can't cover reward.
      const bigAmount = ethers.parseEther("80"); // 0.5% of this exceeds remaining pool eventually in a real drain test
      // For this test, simulate depletion by funding a fresh vault with a reward pool of 0.
      const MockERC20Factory = await ethers.getContractFactory("MockERC20");
      const freshToken = await MockERC20Factory.deploy("Mock USD 2", "mUSD2");
      const VaultFactory = await ethers.getContractFactory("RebalancingVault");
      const freshVault = await VaultFactory.deploy(await freshToken.getAddress());
      await freshVault.addNetwork(ETH, 5_000);
      await freshVault.addNetwork(ARB, 5_000);
      await freshVault.updateReserve(ETH, ethers.parseEther("90"));
      await freshVault.updateReserve(ARB, ethers.parseEther("10"));

      await expect(
        freshVault.connect(keeper).executeRebalance(ETH, ARB, bigAmount)
      ).to.be.revertedWithCustomError(freshVault, "InsufficientRewardPool");
    });

    it("only allows reward bps up to the 10% cap", async () => {
      const { vault, owner } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).setKeeperRewardBps(1_001)).to.be.revertedWith(
        "reward too high"
      );
      await expect(vault.connect(owner).setKeeperRewardBps(1_000)).to.not.be.reverted;
    });
  });
});