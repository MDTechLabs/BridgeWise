import { expect } from "chai";
import hre from "hardhat";

describe("BridgeRoute (safety)", () => {
  let ethers: any;
  let owner: any;
  let route: any;

  const SRC_CHAIN = 1;
  const DST_CHAIN = 2;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    [owner] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const Factory = await ethers.getContractFactory("BridgeRoute");
    route = await Factory.deploy(owner.address);
    await route.waitForDeployment();
  });

  describe("route safety", () => {
    it("rejects unsupported routes", async () => {
      const token = "0x0000000000000000000000000000000000000002";
      await expect(
        route.validateRoute(SRC_CHAIN, DST_CHAIN, token, 1000, 900, 10)
      ).to.be.revertedWithCustomError(route, "RouteNotSupported");
    });

    it("allows configured routes within slippage bounds", async () => {
      const token = "0x0000000000000000000000000000000000000002";
      await route.setRoute(SRC_CHAIN, DST_CHAIN, token, true, 500, 100, 100000);
      {
        try {
          await route.validateRoute(SRC_CHAIN, DST_CHAIN, token, 1000, 950, 10);
        } catch (e) {
          expect.fail("Expected no revert", e.message);
        }
      }
    });

    it("reverts when slippage exceeds max", async () => {
      const token = "0x0000000000000000000000000000000000000002";
      await route.setRoute(SRC_CHAIN, DST_CHAIN, token, true, 100, 100, 100000);
      await expect(
        route.validateRoute(SRC_CHAIN, DST_CHAIN, token, 1000, 800, 10)
      ).to.be.revertedWithCustomError(route, "SlippageExceeded");
    });

    it("reverts when fee exceeds max", async () => {
      const token = "0x0000000000000000000000000000000000000002";
      await route.setRoute(SRC_CHAIN, DST_CHAIN, token, true, 500, 10, 100000);
      await expect(
        route.validateRoute(SRC_CHAIN, DST_CHAIN, token, 1000, 950, 100)
      ).to.be.revertedWithCustomError(route, "FeeExceedsLimit");
    });

    it("reverts when asset is incompatible", async () => {
      const token = "0x0000000000000000000000000000000000000002";
      await route.setRoute(SRC_CHAIN, DST_CHAIN, token, true, 500, 100, 100000);
      await route.setAssetCompatible(SRC_CHAIN, DST_CHAIN, token, false);
      await expect(
        route.validateRoute(SRC_CHAIN, DST_CHAIN, token, 1000, 950, 10)
      ).to.be.revertedWithCustomError(route, "AssetIncompatible");
    });
  });
});
