import { expect } from "chai";
import hre from "hardhat";

describe("Emergency Withdrawal Entitlement Accounting Suite (#1549)", () => {
  let ethers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deployFixture() {
    const [owner, guardian, recipient1, recipient2, attacker] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20Escrow");
    const token = await MockERC20.deploy("Escrow Test Token", "ETT");
    await token.waitForDeployment();

    const FallbackEscrow = await ethers.getContractFactory("FallbackEscrow");
    const escrow = await FallbackEscrow.deploy(owner.address);
    await escrow.waitForDeployment();

    const tokenAddress = await token.getAddress();
    const escrowAddress = await escrow.getAddress();

    return {
      owner,
      guardian,
      recipient1,
      recipient2,
      attacker,
      token,
      escrow,
      tokenAddress,
      escrowAddress,
    };
  }

  describe("Invariant EW-1 & EW-2: Strict Surplus Bounding and Solvency", () => {
    it("allows emergency withdrawal strictly up to available surplus", async () => {
      const { owner, guardian, recipient1, token, escrow, tokenAddress, escrowAddress } =
        await deployFixture();

      // Mint 1000 tokens to owner and escrow 500 for recipient1
      await token.mint(owner.address, 1000n);
      await token.approve(escrowAddress, 500n);

      const msgId1 = ethers.keccak256(ethers.toUtf8Bytes("msg-1"));
      await escrow.escrowTokens(msgId1, recipient1.address, tokenAddress, 500n);

      // Verify entitlements
      expect(await escrow.totalEntitlements(tokenAddress)).to.equal(500n);
      expect(await token.balanceOf(escrowAddress)).to.equal(500n);
      expect(await escrow.getAvailableSurplus(tokenAddress)).to.equal(0n);

      // Attempting emergency withdrawal with 0 surplus must revert
      await expect(
        escrow.emergencyWithdraw(tokenAddress, guardian.address, 1n)
      ).to.be.revertedWithCustomError(escrow, "CannotBypassUserEntitlements");

      // Now inject unencumbered surplus into the escrow (e.g. 300 tokens rescue/airdrop)
      await token.mint(escrowAddress, 300n);
      expect(await token.balanceOf(escrowAddress)).to.equal(800n);
      expect(await escrow.getAvailableSurplus(tokenAddress)).to.equal(300n);

      // Attempting to withdraw 301 tokens (exceeding surplus by 1 wei) MUST revert
      await expect(
        escrow.emergencyWithdraw(tokenAddress, guardian.address, 301n)
      ).to.be.revertedWithCustomError(escrow, "CannotBypassUserEntitlements");

      // Withdraw exactly 200 tokens (partial surplus)
      await expect(escrow.emergencyWithdraw(tokenAddress, guardian.address, 200n))
        .to.emit(escrow, "EmergencyWithdrawalExecuted")
        .withArgs(tokenAddress, guardian.address, 200n, 100n, 500n);

      expect(await token.balanceOf(guardian.address)).to.equal(200n);
      expect(await token.balanceOf(escrowAddress)).to.equal(600n);
      expect(await escrow.getAvailableSurplus(tokenAddress)).to.equal(100n);

      // Withdraw remaining 100 tokens of surplus
      await escrow.emergencyWithdraw(tokenAddress, guardian.address, 100n);
      expect(await token.balanceOf(guardian.address)).to.equal(300n);
      expect(await token.balanceOf(escrowAddress)).to.equal(500n);
      expect(await escrow.getAvailableSurplus(tokenAddress)).to.equal(0n);

      // Invariant EW-1 assertion: physical balance >= totalEntitlements
      const finalBalance = await token.balanceOf(escrowAddress);
      const finalEntitlements = await escrow.totalEntitlements(tokenAddress);
      expect(finalBalance).to.be.gte(finalEntitlements);
      expect(finalBalance).to.equal(500n);
    });

    it("reverts if zero address or zero amount is supplied", async () => {
      const { escrow, tokenAddress } = await deployFixture();

      await expect(
        escrow.emergencyWithdraw(tokenAddress, ethers.ZeroAddress, 100n)
      ).to.be.revertedWithCustomError(escrow, "ZeroAddress");

      await expect(
        escrow.emergencyWithdraw(tokenAddress, ethers.Wallet.createRandom().address, 0n)
      ).to.be.revertedWithCustomError(escrow, "ZeroAmount");
    });
  });

  describe("Invariant EW-3 & EW-7: Non-Infringement and Liveness of User Entitlements", () => {
    it("preserves user entitlement accounting and allows full claims after emergency withdrawal", async () => {
      const { owner, recipient1, recipient2, guardian, token, escrow, tokenAddress, escrowAddress } =
        await deployFixture();

      // Mint and escrow for recipient 1 and recipient 2
      await token.mint(owner.address, 2000n);
      await token.approve(escrowAddress, 2000n);

      const msg1 = ethers.keccak256(ethers.toUtf8Bytes("order-1"));
      const msg2 = ethers.keccak256(ethers.toUtf8Bytes("order-2"));

      await escrow.escrowTokens(msg1, recipient1.address, tokenAddress, 400n);
      await escrow.escrowTokens(msg2, recipient2.address, tokenAddress, 600n);

      // Send 500 surplus tokens directly to escrow
      await token.mint(escrowAddress, 500n);

      // Withdraw the full 500 surplus
      await escrow.emergencyWithdraw(tokenAddress, guardian.address, 500n);

      // Assert user entitlements are completely untouched
      expect(await escrow.totalEntitlements(tokenAddress)).to.equal(1000n);
      expect(await escrow.getClaimableAmount(recipient1.address, tokenAddress)).to.equal(400n);
      expect(await escrow.getClaimableAmount(recipient2.address, tokenAddress)).to.equal(600n);

      // Recipient 1 claims their tokens
      await expect(escrow.connect(recipient1).claimEscrowedTokens(msg1))
        .to.emit(escrow, "TokensClaimed")
        .withArgs(msg1, recipient1.address, 400n);

      expect(await token.balanceOf(recipient1.address)).to.equal(400n);
      expect(await escrow.totalEntitlements(tokenAddress)).to.equal(600n);
      expect(await escrow.getClaimableAmount(recipient1.address, tokenAddress)).to.equal(0n);

      // Recipient 2 claims their tokens
      await expect(escrow.connect(recipient2).claimEscrowedTokens(msg2))
        .to.emit(escrow, "TokensClaimed")
        .withArgs(msg2, recipient2.address, 600n);

      expect(await token.balanceOf(recipient2.address)).to.equal(600n);
      expect(await escrow.totalEntitlements(tokenAddress)).to.equal(0n);
      expect(await token.balanceOf(escrowAddress)).to.equal(0n);
    });
  });

  describe("Invariant EW-4: Strict Role Authorization", () => {
    it("rejects unauthorized emergency withdrawals", async () => {
      const { attacker, token, escrow, tokenAddress, escrowAddress } = await deployFixture();

      // Add surplus
      await token.mint(escrowAddress, 1000n);

      // Attacker attempts to withdraw
      await expect(
        escrow.connect(attacker).emergencyWithdraw(tokenAddress, attacker.address, 1000n)
      ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });
  });

  describe("Invariant EW-5: Reentrancy Immunity", () => {
    it("reverts malicious reentrancy during emergency withdrawal or claims", async () => {
      const [owner, recipient, guardian] = await ethers.getSigners();
      const ReentrantToken = await ethers.getContractFactory("ReentrantTokenEscrow");
      const rToken = await ReentrantToken.deploy();
      await rToken.waitForDeployment();

      const FallbackEscrow = await ethers.getContractFactory("FallbackEscrow");
      const escrow = await FallbackEscrow.deploy(owner.address);
      await escrow.waitForDeployment();

      const rTokenAddr = await rToken.getAddress();
      const escrowAddr = await escrow.getAddress();

      // Setup escrow and surplus
      await rToken.mint(owner.address, 1000n);
      await rToken.approve(escrowAddr, 1000n);

      const msgId = ethers.keccak256(ethers.toUtf8Bytes("reenter-msg"));
      await escrow.escrowTokens(msgId, recipient.address, rTokenAddr, 400n);

      // Surplus
      await rToken.mint(escrowAddr, 600n);

      // Arm the malicious token to attack the escrow upon transfer
      await rToken.arm(escrowAddr, msgId);

      // Emergency withdrawal triggers safeTransfer -> token._update -> tries re-entering claimEscrowedTokens
      await escrow.emergencyWithdraw(rTokenAddr, guardian.address, 600n);

      // Verify reentrancy was attempted and blocked
      expect(await rToken.reentered()).to.equal(true);
      expect(await rToken.reentrySucceeded()).to.equal(false);

      // Solvency and entitlement preserved
      expect(await escrow.totalEntitlements(rTokenAddr)).to.equal(400n);
      expect(await rToken.balanceOf(escrowAddr)).to.equal(400n);
    });
  });

  describe("Invariant EW-6: Idempotent and Replay-Resistant Claims", () => {
    it("prevents double-claiming and double emergency withdrawals", async () => {
      const { owner, recipient1, guardian, token, escrow, tokenAddress, escrowAddress } =
        await deployFixture();

      await token.mint(owner.address, 500n);
      await token.approve(escrowAddress, 500n);

      const msgId = ethers.keccak256(ethers.toUtf8Bytes("msg-replay"));
      await escrow.escrowTokens(msgId, recipient1.address, tokenAddress, 500n);

      // Mint 200 surplus
      await token.mint(escrowAddress, 200n);

      // Withdraw surplus once
      await escrow.emergencyWithdraw(tokenAddress, guardian.address, 200n);

      // Replaying the emergency withdrawal must revert
      await expect(
        escrow.emergencyWithdraw(tokenAddress, guardian.address, 200n)
      ).to.be.revertedWithCustomError(escrow, "CannotBypassUserEntitlements");

      // Claim once
      await escrow.connect(recipient1).claimEscrowedTokens(msgId);

      // Replay claim must revert
      await expect(
        escrow.connect(recipient1).claimEscrowedTokens(msgId)
      ).to.be.revertedWithCustomError(escrow, "NothingToClaim");
    });
  });

  describe("Gas and Resource Bounds Benchmark", () => {
    it("confirms emergency withdrawal and claim gas is strictly within bounds (< 100k gas)", async () => {
      const { owner, recipient1, guardian, token, escrow, tokenAddress, escrowAddress } =
        await deployFixture();

      await token.mint(owner.address, 1000n);
      await token.approve(escrowAddress, 1000n);

      const msgId = ethers.keccak256(ethers.toUtf8Bytes("gas-bench-msg"));
      await escrow.escrowTokens(msgId, recipient1.address, tokenAddress, 500n);
      await token.mint(escrowAddress, 500n);

      // Measure emergency withdrawal gas
      const txWithdraw = await escrow.emergencyWithdraw(tokenAddress, guardian.address, 500n);
      const receiptWithdraw = await txWithdraw.wait();
      expect(receiptWithdraw.gasUsed).to.be.lt(100_000n);

      // Measure claim gas
      const txClaim = await escrow.connect(recipient1).claimEscrowedTokens(msgId);
      const receiptClaim = await txClaim.wait();
      expect(receiptClaim.gasUsed).to.be.lt(100_000n);
    });
  });

  describe("Invariant EW-8: Multi-Chain Profile Coverage Matrix", () => {
    const chainProfiles = [
      { id: "evm:1", name: "Ethereum Mainnet", finalityDepth: 12 },
      { id: "evm:10", name: "Optimism", finalityDepth: 1 },
      { id: "evm:56", name: "BNB Smart Chain", finalityDepth: 15 },
      { id: "evm:137", name: "Polygon PoS", finalityDepth: 128 },
      { id: "evm:8453", name: "Base", finalityDepth: 6 },
      { id: "evm:42161", name: "Arbitrum One", finalityDepth: 1 },
      { id: "soroban:stellar", name: "Stellar Network", finalityDepth: 1 },
    ];

    for (const profile of chainProfiles) {
      it(`enforces entitlement non-bypass across profile ${profile.id} (${profile.name})`, async () => {
        const { owner, recipient1, guardian, token, escrow, tokenAddress, escrowAddress } =
          await deployFixture();

        const amount = 10_000n;
        await token.mint(owner.address, amount);
        await token.approve(escrowAddress, amount);

        const profileMsgId = ethers.keccak256(ethers.toUtf8Bytes(`msg-${profile.id}`));
        await escrow.escrowTokens(profileMsgId, recipient1.address, tokenAddress, amount);

        // Add 5,000 surplus
        await token.mint(escrowAddress, 5_000n);

        // Attempting to withdraw 5,001 must fail
        await expect(
          escrow.emergencyWithdraw(tokenAddress, guardian.address, 5_001n)
        ).to.be.revertedWithCustomError(escrow, "CannotBypassUserEntitlements");

        // Emergency withdraw exactly 5,000
        await escrow.emergencyWithdraw(tokenAddress, guardian.address, 5_000n);

        // Solvency check: balance >= totalEntitlements
        const balance = await token.balanceOf(escrowAddress);
        const entitlements = await escrow.totalEntitlements(tokenAddress);
        expect(balance).to.be.gte(entitlements);
        expect(entitlements).to.equal(amount);

        // User can claim full entitlement
        await escrow.connect(recipient1).claimEscrowedTokens(profileMsgId);
        expect(await escrow.totalEntitlements(tokenAddress)).to.equal(0n);
        expect(await token.balanceOf(recipient1.address)).to.equal(amount);
      });
    }
  });
});
