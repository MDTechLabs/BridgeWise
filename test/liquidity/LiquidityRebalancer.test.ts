import { expect } from "chai";
import hre from "hardhat";

const ETH = 1n;
const ARB = 2n;
const OP = 3n;

describe("LiquidityRebalancer", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const [owner, other] = await ethers.getSigners();

    const Router = await ethers.getContractFactory("MockBridgeRouter");
    const router = await Router.deploy();
    await router.waitForDeployment();

    const Factory = await ethers.getContractFactory("LiquidityRebalancer");
    const rebalancer = await Factory.deploy(await router.getAddress());
    await rebalancer.waitForDeployment();

    // 50/50 split, 20% imbalance bound
    await rebalancer.configureChain(ETH, 5_000, 2_000);
    await rebalancer.configureChain(ARB, 5_000, 2_000);

    return { rebalancer, router, owner, other };
  }

  describe("packed chain configuration", () => {
    it("packs target ratio, imbalance bound, and active flag into one storage word", async () => {
      const { rebalancer } = await deploy();

      const state = await rebalancer.getChainState(ETH);
      expect(state.reserve).to.equal(0n);
      expect(state.targetRatioBps).to.equal(5_000n);
      expect(state.imbalanceBoundBps).to.equal(2_000n);
      expect(state.active).to.equal(true);

      const packed = await rebalancer.chainData(ETH);
      const reserve = packed & ((1n << 128n) - 1n);
      const target = (packed >> 128n) & 0xffffffffn;
      const bound = (packed >> 160n) & 0xffffffffn;
      const flags = packed >> 192n;

      expect(reserve).to.equal(0n);
      expect(target).to.equal(5_000n);
      expect(bound).to.equal(2_000n);
      expect(flags & 1n).to.equal(1n);

      expect(await rebalancer.connectedChainCount()).to.equal(2n);
    });

    it("rejects invalid target ratios and bounds", async () => {
      const { rebalancer } = await deploy();

      await expect(rebalancer.configureChain(OP, 0, 1_000)).to.be.revertedWithCustomError(
        rebalancer,
        "InvalidTargetRatio"
      );
      await expect(rebalancer.configureChain(OP, 10_001, 1_000)).to.be.revertedWithCustomError(
        rebalancer,
        "InvalidTargetRatio"
      );
      await expect(rebalancer.configureChain(OP, 3_000, 0)).to.be.revertedWithCustomError(
        rebalancer,
        "InvalidBound"
      );
    });

    it("only owner can configure chains", async () => {
      const { rebalancer, other } = await deploy();
      await expect(
        rebalancer.connect(other).configureChain(OP, 3_000, 1_000)
      ).to.be.revertedWithCustomError(rebalancer, "Unauthorized");
    });
  });

  describe("reserve tracking and imbalance detection", () => {
    it("computes balanced ratios when reserves match targets", async () => {
      const { rebalancer } = await deploy();

      await rebalancer.updateReserve(ETH, ethers.parseEther("100"));
      await rebalancer.updateReserve(ARB, ethers.parseEther("100"));

      expect(await rebalancer.currentRatioBps(ETH)).to.equal(5_000n);
      expect(await rebalancer.currentRatioBps(ARB)).to.equal(5_000n);
      expect(await rebalancer.skewBps(ETH)).to.equal(0n);
      expect(await rebalancer.isImbalanced(ETH)).to.equal(false);
      expect(await rebalancer.totalReserves()).to.equal(ethers.parseEther("200"));
    });

    it("emits ImbalanceDetected when skew exceeds packed bound", async () => {
      const { rebalancer } = await deploy();

      // ETH 90% / ARB 10% vs 50/50 targets → 40% skew > 20% bound
      await rebalancer.updateReserve(ETH, ethers.parseEther("90"));
      await expect(rebalancer.updateReserve(ARB, ethers.parseEther("10")))
        .to.emit(rebalancer, "ImbalanceDetected")
        .withArgs(ARB, 1_000n, 5_000n, 4_000n);

      expect(await rebalancer.isImbalanced(ETH)).to.equal(true);
      expect(await rebalancer.isImbalanced(ARB)).to.equal(true);
    });

    it("does not flag imbalance when within bound", async () => {
      const { rebalancer } = await deploy();

      // 55/45 → 5% skew < 20% bound
      await rebalancer.updateReserve(ETH, ethers.parseEther("55"));
      await expect(rebalancer.updateReserve(ARB, ethers.parseEther("45"))).to.not.emit(
        rebalancer,
        "ImbalanceDetected"
      );
      expect(await rebalancer.isImbalanced(ETH)).to.equal(false);
    });

    it("reverts updateReserve for inactive chains", async () => {
      const { rebalancer } = await deploy();
      await expect(rebalancer.updateReserve(999, 1)).to.be.revertedWithCustomError(
        rebalancer,
        "ChainNotActive"
      );
    });
  });

  describe("low-level cross-chain rebalance execution", () => {
    it("moves packed reserves and dispatches a low-level bridge call", async () => {
      const { rebalancer, router } = await deploy();

      await rebalancer.updateReserve(ETH, ethers.parseEther("90"));
      await rebalancer.updateReserve(ARB, ethers.parseEther("10"));

      const amount = ethers.parseEther("20");

      await expect(rebalancer.executeRebalance(ETH, ARB, amount))
        .to.emit(rebalancer, "RebalanceRequested")
        .withArgs(ETH, ARB, amount, true)
        .and.to.emit(router, "RebalanceCall")
        .withArgs(ETH, ARB, amount);

      const eth = await rebalancer.getChainState(ETH);
      const arb = await rebalancer.getChainState(ARB);
      expect(eth.reserve).to.equal(ethers.parseEther("70"));
      expect(arb.reserve).to.equal(ethers.parseEther("30"));
      expect(await rebalancer.totalReserves()).to.equal(ethers.parseEther("100"));
      expect(await router.callCount()).to.equal(1n);

      // After move: 70/30 → still skewed (20%) which equals bound (not greater) → balanced enough
      expect(await rebalancer.currentRatioBps(ETH)).to.equal(7_000n);
      expect(await rebalancer.currentRatioBps(ARB)).to.equal(3_000n);
    });

    it("restores ratios toward targets across connected chains", async () => {
      const { rebalancer } = await deploy();

      await rebalancer.updateReserve(ETH, ethers.parseEther("80"));
      await rebalancer.updateReserve(ARB, ethers.parseEther("20"));

      // Move 30 so we land on 50/50
      await rebalancer.executeRebalance(ETH, ARB, ethers.parseEther("30"));

      expect(await rebalancer.currentRatioBps(ETH)).to.equal(5_000n);
      expect(await rebalancer.currentRatioBps(ARB)).to.equal(5_000n);
      expect(await rebalancer.isImbalanced(ETH)).to.equal(false);
      expect(await rebalancer.isImbalanced(ARB)).to.equal(false);
    });

    it("batch rebalances multiple legs and records each bridge call", async () => {
      const { rebalancer, router } = await deploy();

      // Three-way: ETH 70%, ARB 25%, OP 5% vs targets 40/40/20; bound 10%
      await rebalancer.configureChain(OP, 2_000, 1_000);
      await rebalancer.configureChain(ETH, 4_000, 1_000);
      await rebalancer.configureChain(ARB, 4_000, 1_000);

      await rebalancer.updateReserve(ETH, ethers.parseEther("70"));
      await rebalancer.updateReserve(ARB, ethers.parseEther("25"));
      await rebalancer.updateReserve(OP, ethers.parseEther("5"));

      // ETH skew 30%, OP skew 15% — both above 10% bound
      expect(await rebalancer.isImbalanced(ETH)).to.equal(true);
      expect(await rebalancer.isImbalanced(OP)).to.equal(true);

      // Two small legs so intermediate state stays imbalanced for the second call
      const fromChains = [ETH, ETH];
      const toChains = [OP, ARB];
      const amounts = [ethers.parseEther("5"), ethers.parseEther("5")];

      const tx = await rebalancer.executeRebalanceBatch(fromChains, toChains, amounts);
      await expect(tx).to.emit(rebalancer, "RebalanceRequested");
      expect(await router.callCount()).to.equal(2n);

      const eth = await rebalancer.getChainState(ETH);
      const arb = await rebalancer.getChainState(ARB);
      const op = await rebalancer.getChainState(OP);
      expect(eth.reserve).to.equal(ethers.parseEther("60"));
      expect(arb.reserve).to.equal(ethers.parseEther("30"));
      expect(op.reserve).to.equal(ethers.parseEther("10"));
    });

    it("reverts when chains are within bounds", async () => {
      const { rebalancer } = await deploy();

      await rebalancer.updateReserve(ETH, ethers.parseEther("55"));
      await rebalancer.updateReserve(ARB, ethers.parseEther("45"));

      await expect(
        rebalancer.executeRebalance(ETH, ARB, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(rebalancer, "NotImbalanced");
    });

    it("reverts on insufficient source reserve", async () => {
      const { rebalancer } = await deploy();

      await rebalancer.updateReserve(ETH, ethers.parseEther("90"));
      await rebalancer.updateReserve(ARB, ethers.parseEther("10"));

      await expect(
        rebalancer.executeRebalance(ETH, ARB, ethers.parseEther("91"))
      ).to.be.revertedWithCustomError(rebalancer, "InsufficientReserve");
    });

    it("reports success=false when the low-level bridge call fails", async () => {
      const { rebalancer, router } = await deploy();

      await rebalancer.updateReserve(ETH, ethers.parseEther("90"));
      await rebalancer.updateReserve(ARB, ethers.parseEther("10"));
      await router.setShouldFail(true);

      await expect(rebalancer.executeRebalance(ETH, ARB, ethers.parseEther("20")))
        .to.emit(rebalancer, "RebalanceRequested")
        .withArgs(ETH, ARB, ethers.parseEther("20"), false);
    });

    it("reverts on batch length mismatch", async () => {
      const { rebalancer } = await deploy();
      await expect(
        rebalancer.executeRebalanceBatch([ETH], [ARB, OP], [1n])
      ).to.be.revertedWithCustomError(rebalancer, "LengthMismatch");
    });
  });

  describe("gas overhead", () => {
    it("keeps single rebalance step under a low gas budget", async () => {
      const { rebalancer } = await deploy();

      await rebalancer.updateReserve(ETH, ethers.parseEther("90"));
      await rebalancer.updateReserve(ARB, ethers.parseEther("10"));

      const tx = await rebalancer.executeRebalance(ETH, ARB, ethers.parseEther("20"));
      const receipt = await tx.wait();

      // Packed storage + one low-level call should stay well below 150k gas
      expect(receipt.gasUsed).to.be.lt(150_000n);
    });
  });
});
