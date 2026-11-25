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

    it("enforces liquidity reserve floor before route acceptance (#1478)", async () => {
      const token = "0x0000000000000000000000000000000000000002";
      // 100,000 total liquidity, 20,000 reserve floor
      await route["setRoute(uint32,uint32,address,bool,uint256,uint256,uint256,uint256)"](
        SRC_CHAIN, DST_CHAIN, token, true, 500, 100, 200_000, 20_000
      );
      await route.updateLiquidity(SRC_CHAIN, DST_CHAIN, token, 100_000);

      // Route requesting 50,000 leaves 50,000 >= 20,000 floor -> accepted
      expect(await route.validateRoute(SRC_CHAIN, DST_CHAIN, token, 50_000, 49_000, 100)).to.equal(true);

      // Route requesting 85,000 leaves 15,000 < 20,000 floor -> reverts ReserveFloorBreached
      await expect(
        route.validateRoute(SRC_CHAIN, DST_CHAIN, token, 85_000, 84_000, 100)
      ).to.be.revertedWithCustomError(route, "ReserveFloorBreached");
    });

    it("prevents concurrent route reservations from oversubscribing liquidity (#1479)", async () => {
      const token = "0x0000000000000000000000000000000000000002";
      await route["setRoute(uint32,uint32,address,bool,uint256,uint256,uint256,uint256)"](
        SRC_CHAIN, DST_CHAIN, token, true, 500, 100, 200_000, 20_000
      );
      await route.updateLiquidity(SRC_CHAIN, DST_CHAIN, token, 100_000);

      const resId1 = ethers.keccak256(ethers.toUtf8Bytes("res-1"));
      const resId2 = ethers.keccak256(ethers.toUtf8Bytes("res-2"));

      // User 1 reserves 60,000. Available = 100k - 60k = 40k >= 20k floor -> succeeds
      await expect(
        route.reserveLiquidity(resId1, SRC_CHAIN, DST_CHAIN, token, 60_000, 300)
      ).to.emit(route, "LiquidityReserved");

      // User 2 attempts to reserve 30,000 concurrently. Available = 40k. 40k - 30k = 10k < 20k floor -> reverts
      await expect(
        route.reserveLiquidity(resId2, SRC_CHAIN, DST_CHAIN, token, 30_000, 300)
      ).to.be.revertedWithCustomError(route, "LiquidityOversubscribed");
    });

    it("expires abandoned reservations and restores liquidity (#1480)", async () => {
      const token = "0x0000000000000000000000000000000000000002";
      await route["setRoute(uint32,uint32,address,bool,uint256,uint256,uint256,uint256)"](
        SRC_CHAIN, DST_CHAIN, token, true, 500, 100, 200_000, 20_000
      );
      await route.updateLiquidity(SRC_CHAIN, DST_CHAIN, token, 100_000);

      const resId = ethers.keccak256(ethers.toUtf8Bytes("res-abandoned"));
      await route.reserveLiquidity(resId, SRC_CHAIN, DST_CHAIN, token, 70_000, 60);

      // Cannot expire early
      await expect(
        route.expireReservation(resId)
      ).to.be.revertedWithCustomError(route, "ReservationNotExpired");

      // Advance time by 65s
      await hre.network.provider.send("evm_increaseTime", [65]);
      await hre.network.provider.send("evm_mine");

      // Expire abandoned reservation
      await expect(route.expireReservation(resId))
        .to.emit(route, "ReservationExpired");

      // Reserved liquidity reset to 0
      expect(await route.routeReservedLiquidity(SRC_CHAIN, DST_CHAIN, token)).to.equal(0n);
    });

    it("reconciles physical balances and enforces solvency invariant (#1480)", async () => {
      const token = "0x0000000000000000000000000000000000000002";
      await route["setRoute(uint32,uint32,address,bool,uint256,uint256,uint256,uint256)"](
        SRC_CHAIN, DST_CHAIN, token, true, 500, 100, 200_000, 20_000
      );
      await route.updateLiquidity(SRC_CHAIN, DST_CHAIN, token, 100_000);

      // Reconcile with surplus: 110,000
      await expect(
        route.reconcileLiquidity(SRC_CHAIN, DST_CHAIN, token, 110_000)
      ).to.emit(route, "LiquidityReconciled");

      expect(await route.routeLiquidity(SRC_CHAIN, DST_CHAIN, token)).to.equal(110_000n);

      // Reconcile below reserve floor reverts InsolventLiquidity
      await expect(
        route.reconcileLiquidity(SRC_CHAIN, DST_CHAIN, token, 15_000)
      ).to.be.revertedWithCustomError(route, "InsolventLiquidity");
    });
  });
});
