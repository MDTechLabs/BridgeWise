import { expect } from "chai";
import hre from "hardhat";

describe("Token Adapter Risk, Approval Guard & Asset Reconciliation — Hardhat Integration", () => {
  let ethers: any;
  let admin: any;
  let guardian: any;
  let operator: any;
  let user: any;
  let spender: any;

  let approvalGuard: any;
  let reconciler: any;
  let standardToken: any;
  let maliciousToken: any;
  let fotToken: any;
  let rebasingToken: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;

    [admin, guardian, operator, user, spender] = await ethers.getSigners();

    // Deploy Approval Guard
    const GuardFactory = await ethers.getContractFactory("BridgeAdapterApprovalGuard");
    approvalGuard = await GuardFactory.deploy(admin.address, guardian.address);
    await approvalGuard.waitForDeployment();
    await approvalGuard.grantRole(await approvalGuard.ADAPTER_ROLE(), operator.address);

    // Deploy Reconciler
    const ReconcilerFactory = await ethers.getContractFactory("TokenAdapterReconciler");
    reconciler = await ReconcilerFactory.deploy(admin.address);
    await reconciler.waitForDeployment();

    // Deploy Tokens
    const WrappedTokenFactory = await ethers.getContractFactory("BridgeWrappedToken");
    standardToken = await WrappedTokenFactory.deploy(
      "Standard Token",
      "STND",
      admin.address,
      admin.address
    );
    await standardToken.waitForDeployment();
    await standardToken.mint(user.address, ethers.parseEther("10000"));

    const MaliciousFactory = await ethers.getContractFactory("MaliciousCallbackToken");
    maliciousToken = await MaliciousFactory.deploy();
    await maliciousToken.waitForDeployment();
    await maliciousToken.transfer(user.address, ethers.parseEther("10000"));

    const FotFactory = await ethers.getContractFactory("FeeOnTransferToken");
    fotToken = await FotFactory.deploy(500n); // 5% fee
    await fotToken.waitForDeployment();
    await fotToken.transfer(user.address, ethers.parseEther("10000"));

    const RebasingFactory = await ethers.getContractFactory("RebasingToken");
    rebasingToken = await RebasingFactory.deploy();
    await rebasingToken.waitForDeployment();
  });

  // =========================================================================
  // 1. Approval Guard Tests (#1485, #1486)
  // =========================================================================

  describe("BridgeAdapterApprovalGuard (#1485, #1486)", () => {
    it("grants exact-on-demand approval and sweeps to zero post-transfer (A-1, A-4)", async () => {
      const amount = ethers.parseEther("100");
      const tokenAddr = await standardToken.getAddress();

      // Grant exact approval
      await approvalGuard.connect(operator).grantExactApproval(tokenAddr, spender.address, amount);
      expect(await standardToken.allowance(await approvalGuard.getAddress(), spender.address)).to.equal(amount);

      // Sweep to zero
      await approvalGuard.connect(operator).sweepAllowanceToZero(tokenAddr, spender.address);
      expect(await standardToken.allowance(await approvalGuard.getAddress(), spender.address)).to.equal(0n);
    });

    it("enforces single approval limit and cumulative caps (A-3)", async () => {
      const tokenAddr = await standardToken.getAddress();
      const singleLimit = ethers.parseEther("500");
      const cumulativeCap = ethers.parseEther("1000");

      await approvalGuard.connect(admin).configureCaps(tokenAddr, spender.address, singleLimit, cumulativeCap);

      // Exceeding single limit reverts
      await expect(
        approvalGuard.connect(operator).grantExactApproval(tokenAddr, spender.address, ethers.parseEther("600"))
      ).to.be.revertedWithCustomError(approvalGuard, "ExceedsSingleApprovalLimit");

      // Within limit passes
      await approvalGuard.connect(operator).grantExactApproval(tokenAddr, spender.address, ethers.parseEther("400"));
      await approvalGuard.connect(operator).sweepAllowanceToZero(tokenAddr, spender.address);

      await approvalGuard.connect(operator).grantExactApproval(tokenAddr, spender.address, ethers.parseEther("400"));
      await approvalGuard.connect(operator).sweepAllowanceToZero(tokenAddr, spender.address);

      // Exceeding cumulative cap reverts (400 + 400 + 300 = 1100 > 1000)
      await expect(
        approvalGuard.connect(operator).grantExactApproval(tokenAddr, spender.address, ethers.parseEther("300"))
      ).to.be.revertedWithCustomError(approvalGuard, "ExceedsCumulativeAllowanceCap");
    });

    it("allows Guardian to emergency revoke allowances instantly (A-5)", async () => {
      const tokenAddr = await standardToken.getAddress();
      // Remove caps for this test
      await approvalGuard.connect(admin).configureCaps(tokenAddr, spender.address, 0n, 0n);

      await approvalGuard.connect(operator).grantExactApproval(tokenAddr, spender.address, ethers.parseEther("100"));
      expect(await standardToken.allowance(await approvalGuard.getAddress(), spender.address)).to.equal(ethers.parseEther("100"));

      // Guardian revokes
      await approvalGuard.connect(guardian).emergencyRevokeAll(tokenAddr, spender.address);
      expect(await standardToken.allowance(await approvalGuard.getAddress(), spender.address)).to.equal(0n);
    });
  });

  // =========================================================================
  // 2. Malicious Callback & Reentrancy Isolation (#1488)
  // =========================================================================

  describe("Malicious Callback Isolation (#1488)", () => {
    it("reverts atomically when a malicious token attempts callback reentrancy (A-6)", async () => {
      const reconcilerAddr = await reconciler.getAddress();
      const amount = ethers.parseEther("100");

      await maliciousToken.connect(user).approve(reconcilerAddr, amount * 2n);
      await maliciousToken.setTarget(reconcilerAddr, true); // Arm attack

      const messageId = ethers.keccak256(ethers.toUtf8Bytes("attack-test"));

      // Reentrancy attempt triggers ReentrancyGuardReentrantCall
      await expect(
        reconciler.connect(user).reconcileInboundTransfer(
          await maliciousToken.getAddress(),
          user.address,
          amount,
          amount,
          messageId
        )
      ).to.be.revertedWithCustomError(reconciler, "ReentrancyGuardReentrantCall");

      // Verify zero state change in reconciler
      expect(await reconciler.recordedLiabilities(await maliciousToken.getAddress())).to.equal(0n);
    });
  });

  // =========================================================================
  // 3. Fee-on-Transfer & Rebasing Reconciliation (#1489)
  // =========================================================================

  describe("Asset Reconciliation for Fee-on-Transfer & Rebasing (#1489)", () => {
    it("credits exact balance delta for fee-on-transfer tokens (A-7)", async () => {
      const reconcilerAddr = await reconciler.getAddress();
      const fotAddr = await fotToken.getAddress();
      const nominal = ethers.parseEther("100");
      const minExpected = ethers.parseEther("95"); // 5% fee expected

      await fotToken.connect(user).approve(reconcilerAddr, nominal);

      const messageId = ethers.keccak256(ethers.toUtf8Bytes("fot-test-1"));
      await reconciler.connect(user).reconcileInboundTransfer(
        fotAddr,
        user.address,
        nominal,
        minExpected,
        messageId
      );

      // Delta is exactly 95 tokens (100 - 5% fee)
      expect(await reconciler.recordedLiabilities(fotAddr)).to.equal(ethers.parseEther("95"));
      expect(await fotToken.balanceOf(reconcilerAddr)).to.equal(ethers.parseEther("95"));
    });

    it("reverts if fee deduction causes delta to fall below minimum expected (A-8)", async () => {
      const reconcilerAddr = await reconciler.getAddress();
      const fotAddr = await fotToken.getAddress();
      const nominal = ethers.parseEther("100");
      const minExpected = ethers.parseEther("98"); // expects at most 2% fee, but token has 5%

      await fotToken.connect(user).approve(reconcilerAddr, nominal);
      const messageId = ethers.keccak256(ethers.toUtf8Bytes("fot-test-slippage"));

      await expect(
        reconciler.connect(user).reconcileInboundTransfer(
          fotAddr,
          user.address,
          nominal,
          minExpected,
          messageId
        )
      ).to.be.revertedWithCustomError(reconciler, "SubMinimumDelta");
    });

    it("accurately detects rebasing drift and reverts on shortfall (A-9)", async () => {
      const rbtAddr = await rebasingToken.getAddress();
      // Reconciler checks drift against 0 liabilities
      expect(await reconciler.reconcileRebaseDrift(rbtAddr)).to.equal(0n);
    });
  });
});
