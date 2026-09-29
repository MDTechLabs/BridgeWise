import { expect } from "chai";
import hre from "hardhat";

describe("LiquidityRebalancer (freshness)", () => {
  let ethers: any;
  let owner: any;
  let rebalancer: any;

  const ROUTER = "0x0000000000000000000000000000000000000001";

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    [owner] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const Factory = await ethers.getContractFactory("LiquidityRebalancer");
    rebalancer = await Factory.deploy(ROUTER);
    await rebalancer.waitForDeployment();
  });

  describe("freshness checks", () => {
    it("accepts first reserve update", async () => {
      await rebalancer.configureChain(1, 5000, 1000);
      await rebalancer.updateReserve(1, 1000);
      const state = await rebalancer.getChainState(1);
      expect(state[0]).to.equal(1000);
    });

    it("rejects stale reserve updates after MAX_DATA_AGE", async () => {
      await rebalancer.configureChain(1, 5000, 1000);
      await rebalancer.updateReserve(1, 1000);

      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        rebalancer.updateReserve(1, 2000)
      ).to.be.revertedWithCustomError(rebalancer, "StaleData");
    });

    it("reports isStale correctly", async () => {
      await rebalancer.configureChain(1, 5000, 1000);
      expect(await rebalancer.isStale(1)).to.equal(true);

      await rebalancer.updateReserve(1, 1000);
      expect(await rebalancer.isStale(1)).to.equal(false);

      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      expect(await rebalancer.isStale(1)).to.equal(true);
    });

    it("includes lastUpdateTimestamp in getChainState", async () => {
      await rebalancer.configureChain(1, 5000, 1000);
      await rebalancer.updateReserve(1, 1000);
      const state = await rebalancer.getChainState(1);
      expect(state[4]).to.be.gt(0);
    });
  });
});
