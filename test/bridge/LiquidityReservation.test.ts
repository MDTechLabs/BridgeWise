import { expect } from "chai";
import hre from "hardhat";

describe("LiquidityReservation & Floor Enforcement (#1478, #1479, #1480)", () => {
  let ethers: any;
  let admin: any;
  let user1: any;
  let user2: any;
  let attacker: any;
  let route: any;

  const SRC_CHAIN = 1;
  const DST_CHAIN = 2;
  const TOKEN = "0x00000000000000000000000000000000000000AA";
  const TOTAL_LIQUIDITY = 1_000_000n;
  const RESERVE_FLOOR = 200_000n;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    [admin, user1, user2, attacker] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const Factory = await ethers.getContractFactory("BridgeRoute");
    route = await Factory.deploy(admin.address);
    await route.waitForDeployment();

    // Configure route with reserve floor
    await route.setRoute(
      SRC_CHAIN,
      DST_CHAIN,
      TOKEN,
      true,
      500, // max 5% slippage
      100, // max 1% fee
      2_000_000n, // exposure limit
      RESERVE_FLOOR,
      30, // min duration
      3600 // max duration
    );

    // Seed liquidity
    await route.updateLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN, TOTAL_LIQUIDITY);
  });

  describe("Reserve Floor Enforcement (#1478)", () => {
    it("accepts transfer when remaining liquidity is above reserve floor", async () => {
      // 1,000,000 - 500,000 = 500,000 >= 200,000 floor
      expect(await route.validateRoute(SRC_CHAIN, DST_CHAIN, TOKEN, 500_000n, 490_000n, 100n)).to.equal(true);
    });

    it("accepts transfer that reduces liquidity exactly to reserve floor", async () => {
      // 1,000,000 - 800,000 = 200,000 == 200,000 floor
      expect(await route.validateRoute(SRC_CHAIN, DST_CHAIN, TOKEN, 800_000n, 790_000n, 100n)).to.equal(true);
    });

    it("reverts when transfer would breach reserve floor", async () => {
      // 1,000,000 - 800,001 = 199,999 < 200,000 floor
      await expect(
        route.validateRoute(SRC_CHAIN, DST_CHAIN, TOKEN, 800_001n, 790_000n, 100n)
      ).to.be.revertedWithCustomError(route, "ReserveFloorBreached")
        .withArgs(TOTAL_LIQUIDITY, 800_001n, RESERVE_FLOOR);
    });

    it("rejects non-admin attempting to update liquidity or reserve floor", async () => {
      await expect(
        route.connect(attacker).updateLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN, 500_000n)
      ).to.be.revertedWithCustomError(route, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Concurrent Route Reservations & Anti-Oversubscription (#1479)", () => {
    it("atomically locks liquidity on reservation", async () => {
      const resId = ethers.keccak256(ethers.toUtf8Bytes("res-user1-1"));
      await expect(
        route.connect(user1).reserveLiquidity(resId, SRC_CHAIN, DST_CHAIN, TOKEN, 300_000n, 300)
      ).to.emit(route, "LiquidityReserved")
        .withArgs(resId, user1.address, SRC_CHAIN, DST_CHAIN, TOKEN, 300_000n, (await ethers.provider.getBlock("latest")).timestamp + 300);

      expect(await route.routeReservedLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN)).to.equal(300_000n);
    });

    it("prevents concurrent reservations from oversubscribing pool capacity", async () => {
      const resId1 = ethers.keccak256(ethers.toUtf8Bytes("res-race-1"));
      const resId2 = ethers.keccak256(ethers.toUtf8Bytes("res-race-2"));

      // Max unreserved capacity that maintains floor = 1,000,000 - 200,000 = 800,000.
      // User 1 reserves 500,000
      await route.connect(user1).reserveLiquidity(resId1, SRC_CHAIN, DST_CHAIN, TOKEN, 500_000n, 300);

      // User 2 tries to reserve 400,000 concurrently: 500k + 400k = 900k > 800k capacity -> Reverts!
      await expect(
        route.connect(user2).reserveLiquidity(resId2, SRC_CHAIN, DST_CHAIN, TOKEN, 400_000n, 300)
      ).to.be.revertedWithCustomError(route, "LiquidityOversubscribed");

      // Verify state was not mutated by reverting transaction
      expect(await route.routeReservedLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN)).to.equal(500_000n);
    });

    it("rejects duplicate or replayed reservation IDs", async () => {
      const resId = ethers.keccak256(ethers.toUtf8Bytes("res-replay-test"));
      await route.connect(user1).reserveLiquidity(resId, SRC_CHAIN, DST_CHAIN, TOKEN, 100_000n, 300);

      await expect(
        route.connect(user1).reserveLiquidity(resId, SRC_CHAIN, DST_CHAIN, TOKEN, 100_000n, 300)
      ).to.be.revertedWithCustomError(route, "ReservationAlreadyExists")
        .withArgs(resId);
    });

    it("rejects reservations with duration outside configured bounds", async () => {
      const resIdTooShort = ethers.keccak256(ethers.toUtf8Bytes("res-short"));
      const resIdTooLong = ethers.keccak256(ethers.toUtf8Bytes("res-long"));

      await expect(
        route.connect(user1).reserveLiquidity(resIdTooShort, SRC_CHAIN, DST_CHAIN, TOKEN, 100_000n, 10) // < 30s
      ).to.be.revertedWithCustomError(route, "InvalidReservationDuration");

      await expect(
        route.connect(user1).reserveLiquidity(resIdTooLong, SRC_CHAIN, DST_CHAIN, TOKEN, 100_000n, 5000) // > 3600s
      ).to.be.revertedWithCustomError(route, "InvalidReservationDuration");
    });

    it("correctly consumes reservation upon execution", async () => {
      const resId = ethers.keccak256(ethers.toUtf8Bytes("res-consume-1"));
      await route.connect(user1).reserveLiquidity(resId, SRC_CHAIN, DST_CHAIN, TOKEN, 250_000n, 300);

      await expect(route.connect(user1).consumeReservation(resId))
        .to.emit(route, "ReservationConsumed")
        .withArgs(resId, user1.address, TOKEN, 250_000n);

      // Invariants: reserved decremented by 250k, total decremented by 250k
      expect(await route.routeReservedLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN)).to.equal(0n);
      expect(await route.routeLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN)).to.equal(750_000n);

      // Cannot consume twice
      await expect(
        route.connect(user1).consumeReservation(resId)
      ).to.be.revertedWithCustomError(route, "ReservationAlreadyCompleted");
    });
  });

  describe("Expiration of Abandoned Reservations & Balance Reconciliation (#1480)", () => {
    it("expires abandoned reservation after TTL and restores reserved liquidity", async () => {
      const resId = ethers.keccak256(ethers.toUtf8Bytes("res-abandoned-test"));
      await route.connect(user1).reserveLiquidity(resId, SRC_CHAIN, DST_CHAIN, TOKEN, 500_000n, 60);

      // Cannot expire while still active
      await expect(
        route.connect(attacker).expireReservation(resId)
      ).to.be.revertedWithCustomError(route, "ReservationNotExpired");

      // Advance time past expiry (65s)
      await hre.network.provider.send("evm_increaseTime", [65]);
      await hre.network.provider.send("evm_mine");

      // Anyone (permissionless) can expire abandoned reservation
      await expect(route.connect(attacker).expireReservation(resId))
        .to.emit(route, "ReservationExpired");

      expect(await route.routeReservedLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN)).to.equal(0n);
      expect(await route.routeLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN)).to.equal(TOTAL_LIQUIDITY);

      // Another user can now reserve that capacity
      const resIdNew = ethers.keccak256(ethers.toUtf8Bytes("res-new-user2"));
      await expect(
        route.connect(user2).reserveLiquidity(resIdNew, SRC_CHAIN, DST_CHAIN, TOKEN, 500_000n, 60)
      ).to.emit(route, "LiquidityReserved");
    });

    it("batch expires multiple abandoned reservations", async () => {
      const id1 = ethers.keccak256(ethers.toUtf8Bytes("batch-1"));
      const id2 = ethers.keccak256(ethers.toUtf8Bytes("batch-2"));

      await route.connect(user1).reserveLiquidity(id1, SRC_CHAIN, DST_CHAIN, TOKEN, 200_000n, 60);
      await route.connect(user2).reserveLiquidity(id2, SRC_CHAIN, DST_CHAIN, TOKEN, 300_000n, 60);

      expect(await route.routeReservedLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN)).to.equal(500_000n);

      await hre.network.provider.send("evm_increaseTime", [65]);
      await hre.network.provider.send("evm_mine");

      const tx = await route.expireReservations([id1, id2]);
      await tx.wait();

      expect(await route.routeReservedLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN)).to.equal(0n);
    });

    it("allows user to release their reservation early", async () => {
      const resId = ethers.keccak256(ethers.toUtf8Bytes("res-early-cancel"));
      await route.connect(user1).reserveLiquidity(resId, SRC_CHAIN, DST_CHAIN, TOKEN, 200_000n, 300);

      // Attacker cannot release user1's reservation
      await expect(
        route.connect(attacker).releaseReservation(resId)
      ).to.be.revertedWithCustomError(route, "Unauthorized");

      // User1 releases own reservation
      await expect(route.connect(user1).releaseReservation(resId))
        .to.emit(route, "ReservationReleased")
        .withArgs(resId, user1.address, TOKEN, 200_000n);

      expect(await route.routeReservedLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN)).to.equal(0n);
    });

    it("reconciles physical balances and enforces solvency invariant", async () => {
      // Reconcile with surplus physical balance: 1,150,000
      await expect(
        route.connect(admin).reconcileLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN, 1_150_000n)
      ).to.emit(route, "LiquidityReconciled")
        .withArgs(SRC_CHAIN, DST_CHAIN, TOKEN, TOTAL_LIQUIDITY, 1_150_000n, 150_000n);

      expect(await route.routeLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN)).to.equal(1_150_000n);

      // Active reservation of 300k, floor 200k => minimum required = 500k
      const resId = ethers.keccak256(ethers.toUtf8Bytes("res-active-reconcile"));
      await route.connect(user1).reserveLiquidity(resId, SRC_CHAIN, DST_CHAIN, TOKEN, 300_000n, 300);

      // Physical balance reported as 450,000 < 500,000 (insolvency) -> Reverts!
      await expect(
        route.connect(admin).reconcileLiquidity(SRC_CHAIN, DST_CHAIN, TOKEN, 450_000n)
      ).to.be.revertedWithCustomError(route, "InsolventLiquidity")
        .withArgs(450_000n, 300_000n, RESERVE_FLOOR);
    });
  });
});
