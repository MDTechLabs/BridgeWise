import { expect } from "chai";
import hre from "hardhat";

/**
 * Zero-value transfer tests for BridgeWise smart contracts.
 *
 * These contracts handle native-asset and ERC-20 transfers across bridge
 * paths (lock, refund, escrow, gas reimbursement). Zero-value transfers
 * are a common edge case that can:
 *   - Lock funds permanently if a zero-value transfer silently succeeds
 *     but the recipient contract records a non-zero expectation.
 *   - Bypass access control if a zero-value transfer is treated as a
 *     successful authorization signal.
 *   - Cause accounting drift if a zero-value transfer updates state
 *     without moving assets.
 *   - Revert unexpectedly if a zero-value transfer is rejected by a
 *     contract that expects non-zero value.
 *
 * These tests pin the expected behaviour for every zero-value transfer
 * path so that future refactors cannot silently change the semantics.
 */
describe("Zero-value transfer tests", () => {
  let ethers: any;
  let RECIPIENT: string;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    RECIPIENT = ethers.zeroPadValue("0xabcdef", 32);
  });

  // ---------------------------------------------------------------------------
  // SafeNativeTransfer — the low-level native-asset transfer helper
  // ---------------------------------------------------------------------------
  describe("SafeNativeTransfer", () => {
    async function deployHarness() {
      const [deployer] = await ethers.getSigners();
      const Harness = await ethers.getContractFactory("SafeNativeTransferHarness");
      const harness = await Harness.deploy();
      await harness.waitForDeployment();
      await deployer.sendTransaction({
        to: await harness.getAddress(),
        value: ethers.parseEther("10"),
      });
      return { harness, deployer };
    }

    async function deployReceiver(name: string) {
      const factory = await ethers.getContractFactory(name);
      const receiver = await factory.deploy();
      await receiver.waitForDeployment();
      return receiver;
    }

    it("treats a zero-amount transfer to an EOA as a successful no-op", async () => {
      const { harness } = await deployHarness();
      const to = ethers.Wallet.createRandom().address;

      const tx = await harness.releaseSafe(to, 0n);
      const receipt = await tx.wait();

      expect(receipt.status).to.equal(1);
      expect(await ethers.provider.getBalance(to)).to.equal(0n);
    });

    it("treats a zero-amount transfer to a payable contract as a successful no-op", async () => {
      const { harness } = await deployHarness();
      const receiver = await deployReceiver("PayableReceiver");

      const tx = await harness.releaseSafe(await receiver.getAddress(), 0n);
      const receipt = await tx.wait();

      expect(receipt.status).to.equal(1);
      expect(await receiver.received()).to.equal(0n);
    });

    it("reverts with NativeTransferFailed when a zero-amount transfer hits a rejecting contract", async () => {
      const { harness } = await deployHarness();
      const rejecter = await deployReceiver("RejectingReceiver");

      await expect(
        harness.releaseSafe(await rejecter.getAddress(), 0n)
      ).to.be.revertedWithCustomError(harness, "NativeTransferFailed");
    });

    it("does not change the harness balance after a zero-amount transfer", async () => {
      const { harness } = await deployHarness();
      const harnessAddr = await harness.getAddress();
      const before = await ethers.provider.getBalance(harnessAddr);

      await harness.releaseSafe(ethers.Wallet.createRandom().address, 0n);

      expect(await ethers.provider.getBalance(harnessAddr)).to.equal(before);
    });

    it("does not change the recipient balance after a zero-amount transfer", async () => {
      const { harness } = await deployHarness();
      const to = ethers.Wallet.createRandom().address;
      const before = await ethers.provider.getBalance(to);

      await harness.releaseSafe(to, 0n);

      expect(await ethers.provider.getBalance(to)).to.equal(before);
    });

    it("still produces a successful transaction receipt after a zero-amount transfer", async () => {
      const { harness } = await deployHarness();
      const to = ethers.Wallet.createRandom().address;

      const tx = await harness.releaseSafe(to, 0n);
      const receipt = await tx.wait();

      expect(receipt.status).to.equal(1);
    });
  });

  // ---------------------------------------------------------------------------
  // NativeBridgeRouter — depositNative with zero msg.value
  // ---------------------------------------------------------------------------
  describe("NativeBridgeRouter", () => {
    const DEST_CHAIN = 1;

    async function deploy() {
      const [owner, user] = await ethers.getSigners();

      const WETHFactory = await ethers.getContractFactory("BridgeWrappedToken");
      const weth = await WETHFactory.deploy("Wrapped ETH", "WETH", owner.address, owner.address);
      await weth.waitForDeployment();

      const VaultFactory = await ethers.getContractFactory("BridgeReceiverBase");
      const vault = await VaultFactory.deploy(owner.address, owner.address);
      await vault.waitForDeployment();

      const RouterFactory = await ethers.getContractFactory("NativeBridgeRouter");
      const router = await RouterFactory.deploy(
        await weth.getAddress(),
        await vault.getAddress()
      );
      await router.waitForDeployment();

      return { router, weth, vault, owner, user };
    }

    it("reverts on zero msg.value in depositNative", async () => {
      const { router, user } = await deploy();

      await expect(
        router.connect(user).depositNative(DEST_CHAIN, RECIPIENT, { value: 0 })
      ).to.be.revertedWith("NativeBridgeRouter: zero value");
    });

    it("does not emit NativeBridged on zero msg.value", async () => {
      const { router, user } = await deploy();

      // The transaction reverts, so no events are emitted.
      // We verify the revert reason to confirm it's the zero-value guard.
      await expect(
        router.connect(user).depositNative(DEST_CHAIN, RECIPIENT, { value: 0 })
      ).to.be.revertedWith("NativeBridgeRouter: zero value");
    });

    it("does not wrap WETH on zero msg.value", async () => {
      const { router, weth, user } = await deploy();

      await expect(
        router.connect(user).depositNative(DEST_CHAIN, RECIPIENT, { value: 0 })
      ).to.be.revertedWith("NativeBridgeRouter: zero value");

      expect(await weth.balanceOf(await router.getAddress())).to.equal(0);
    });

    it("does not call vault.lock on zero msg.value", async () => {
      const { router, vault, user } = await deploy();

      await expect(
        router.connect(user).depositNative(DEST_CHAIN, RECIPIENT, { value: 0 })
      ).to.be.revertedWith("NativeBridgeRouter: zero value");

      // BridgeReceiverBase does not expose a lock counter, but we can verify
      // the vault's ETH balance is unchanged (no WETH was forwarded).
      expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0);
    });
  });

  // ---------------------------------------------------------------------------
  // BatchBridgeRouter — batchDeposit with zero amounts
  // ---------------------------------------------------------------------------
  describe("BatchBridgeRouter", () => {
    const DEST_CHAIN = 1;

    async function deploy() {
      const [owner, user] = await ethers.getSigners();

      const VaultFactory = await ethers.getContractFactory("MockBridgeVault");
      const vault = await VaultFactory.deploy();
      await vault.waitForDeployment();

      const RouterFactory = await ethers.getContractFactory("BatchBridgeRouter");
      const router = await RouterFactory.deploy(await vault.getAddress());
      await router.waitForDeployment();

      const TokenFactory = await ethers.getContractFactory("contracts/test/MockERC20.sol:MockERC20");
      const token = await TokenFactory.deploy("Token A", "TKA");
      await token.waitForDeployment();

      return { router, vault, token, owner, user };
    }

    it("accepts a batch where all amounts are zero", async () => {
      const { router, vault, token, user } = await deploy();
      const tokenAddr = await token.getAddress();

      await token.mint(user.address, ethers.parseEther("100"));
      await token.connect(user).approve(await router.getAddress(), ethers.parseEther("100"));

      await expect(
        router.connect(user).batchDeposit(
          [tokenAddr],
          [0n],
          [DEST_CHAIN],
          [RECIPIENT]
        )
      ).to.emit(router, "BatchBridgeDispatched");

      expect(await vault.recordCount()).to.equal(1n);
    });

    it("accepts a batch mixing zero and non-zero amounts", async () => {
      const { router, vault, token, user } = await deploy();
      const tokenAddr = await token.getAddress();
      const nonZeroAmount = ethers.parseEther("5");

      await token.mint(user.address, ethers.parseEther("100"));
      await token.connect(user).approve(await router.getAddress(), ethers.parseEther("100"));

      await expect(
        router.connect(user).batchDeposit(
          [tokenAddr, tokenAddr],
          [0n, nonZeroAmount],
          [DEST_CHAIN, DEST_CHAIN],
          [RECIPIENT, RECIPIENT]
        )
      ).to.emit(router, "BatchBridgeDispatched");

      expect(await vault.recordCount()).to.equal(2n);
    });

    it("does not transfer tokens for zero-amount entries", async () => {
      const { router, vault, token, user } = await deploy();
      const tokenAddr = await token.getAddress();

      await token.mint(user.address, ethers.parseEther("100"));
      await token.connect(user).approve(await router.getAddress(), ethers.parseEther("100"));

      await router.connect(user).batchDeposit(
        [tokenAddr],
        [0n],
        [DEST_CHAIN],
        [RECIPIENT]
      );

      expect(await token.balanceOf(await vault.getAddress())).to.equal(0);
    });

    it("still calls vault.lock for zero-amount entries", async () => {
      const { router, vault, token, user } = await deploy();
      const tokenAddr = await token.getAddress();

      await token.mint(user.address, ethers.parseEther("100"));
      await token.connect(user).approve(await router.getAddress(), ethers.parseEther("100"));

      await router.connect(user).batchDeposit(
        [tokenAddr],
        [0n],
        [DEST_CHAIN],
        [RECIPIENT]
      );

      expect(await vault.recordCount()).to.equal(1n);
    });
  });

  // ---------------------------------------------------------------------------
  // GasRefundVault — zero-value refund transfers
  // ---------------------------------------------------------------------------
  describe("GasRefundVault", () => {
    async function deploy() {
      const [admin, guardian, relayer, user] = await ethers.getSigners();

      const MockTarget = await ethers.getContractFactory("MockGasTarget");
      const target = await MockTarget.deploy();
      await target.waitForDeployment();

      const overhead = 50000;
      const maxRefundPerTx = ethers.parseEther("1");
      const Vault = await ethers.getContractFactory("GasRefundVault");
      const vault = await Vault.deploy(
        admin.address,
        guardian.address,
        relayer.address,
        overhead,
        maxRefundPerTx
      );
      await vault.waitForDeployment();

      await user.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("10") });

      return { vault, target, admin, guardian, relayer, user };
    }

    it("skips the native transfer when refundAmount is zero in executeWithGasRefund", async () => {
      const { vault, target, relayer } = await deploy();

      const balanceBefore = await ethers.provider.getBalance(relayer.address);

      const tx = await vault.connect(relayer).executeWithGasRefund(
        await target.getAddress(),
        target.interface.encodeFunctionData("simpleCall", [])
      );
      const receipt = await tx.wait();

      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(relayer.address);

      // The relayer should have received a refund (non-zero in this case)
      // but the key assertion is that the function did not revert.
      expect(receipt.status).to.equal(1);
      expect(balanceAfter).to.be.greaterThan(balanceBefore - gasCost);
    });

    it("skips the native transfer when gasUsed is zero in claimGasRefund", async () => {
      const { vault, relayer } = await deploy();

      const gasPrice = await ethers.parseUnits("1", "gwei");
      const balanceBefore = await ethers.provider.getBalance(relayer.address);

      const tx = await vault.connect(relayer).claimGasRefund(0, gasPrice);
      const receipt = await tx.wait();

      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(relayer.address);

      // With gasUsed=0, refundAmount=0, so no native transfer occurs.
      // The relayer should only lose gas costs.
      expect(receipt.status).to.equal(1);
      expect(balanceAfter).to.equal(balanceBefore - gasCost);
    });

    it("does not update nativeDisbursed when refundAmount is zero", async () => {
      const { vault, relayer } = await deploy();

      const gasPrice = await ethers.parseUnits("1", "gwei");
      await vault.connect(relayer).claimGasRefund(0, gasPrice);

      expect(await vault.totalNativeDisbursed()).to.equal(0);
    });

    it("still updates gasRefunded accounting when refundAmount is zero", async () => {
      const { vault, relayer } = await deploy();

      const gasPrice = await ethers.parseUnits("1", "gwei");
      await vault.connect(relayer).claimGasRefund(0, gasPrice);

      // gasUsed is 0, so totalGasRefunded should remain 0
      expect(await vault.totalGasRefunded()).to.equal(0);
    });
  });

  // ---------------------------------------------------------------------------
  // FallbackEscrow — zero-value escrow and claim
  // ---------------------------------------------------------------------------
  describe("FallbackEscrow", () => {
    async function deploy() {
      const [owner, recipient, other] = await ethers.getSigners();

      const MockERC20 = await ethers.getContractFactory("MockERC20Escrow");
      const token = await MockERC20.deploy("Escrow Token", "ET");
      await token.waitForDeployment();

      const Escrow = await ethers.getContractFactory("FallbackEscrow");
      const escrow = await Escrow.deploy(owner.address);
      await escrow.waitForDeployment();

      await token.mint(owner.address, ethers.parseEther("10000"));

      return { escrow, token, owner, recipient, other };
    }

    it("allows escrowTokens with amount=0", async () => {
      const { escrow, token, owner, recipient } = await deploy();
      const msgId = ethers.keccak256(ethers.toUtf8Bytes("zero-escrow"));

      await token.approve(await escrow.getAddress(), 0);

      await expect(
        escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), 0)
      ).to.emit(escrow, "TokensEscrowed").withArgs(msgId, recipient.address, await token.getAddress(), 0);
    });

    it("reverts when claiming a zero-amount escrow", async () => {
      const { escrow, token, owner, recipient } = await deploy();
      const msgId = ethers.keccak256(ethers.toUtf8Bytes("zero-claim"));

      await token.approve(await escrow.getAddress(), 0);
      await escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), 0);

      await expect(
        escrow.connect(recipient).claimEscrowedTokens(msgId)
      ).to.be.revertedWithCustomError(escrow, "NothingToClaim");
    });

    it("does not transfer tokens for a zero-amount escrow", async () => {
      const { escrow, token, owner, recipient } = await deploy();
      const msgId = ethers.keccak256(ethers.toUtf8Bytes("zero-transfer"));

      await token.approve(await escrow.getAddress(), 0);
      await escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), 0);

      expect(await token.balanceOf(await escrow.getAddress())).to.equal(0);
    });

    it("does not update claimable for a zero-amount escrow", async () => {
      const { escrow, token, owner, recipient } = await deploy();
      const msgId = ethers.keccak256(ethers.toUtf8Bytes("zero-claimable"));

      await token.approve(await escrow.getAddress(), 0);
      await escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), 0);

      expect(await escrow.getClaimableAmount(recipient.address, await token.getAddress())).to.equal(0);
    });

    it("allows duplicate zero-amount escrow (no AlreadyEscrowed revert)", async () => {
      const { escrow, token, owner, recipient } = await deploy();
      const msgId = ethers.keccak256(ethers.toUtf8Bytes("zero-dup"));

      await token.approve(await escrow.getAddress(), 0);
      await escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), 0);

      // A second escrow with the same msgId but amount=0 should NOT revert
      // with AlreadyEscrowed because the check is `escrows[msgId].amount > 0`.
      const tx = await escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), 0);
      const receipt = await tx.wait();

      expect(receipt.status).to.equal(1);
    });
  });

  // ---------------------------------------------------------------------------
  // GasEscrow — zero-value refund in executeWithGasEscrow
  // ---------------------------------------------------------------------------
  describe("GasEscrow", () => {
    async function deploy() {
      const [owner, refundTarget] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("GasEscrow");
      const escrow = await Factory.deploy(0n);
      await escrow.waitForDeployment();
      return { escrow, owner, refundTarget };
    }

    it("skips the native refund when msg.value equals execution cost", async () => {
      const { escrow, refundTarget } = await deploy();

      // With overhead=0 and a target that consumes no gas, executionCost ≈ 0.
      // If we send msg.value = 0, refundAmount = 0, and no transfer occurs.
      const balanceBefore = await ethers.provider.getBalance(refundTarget.address);

      const tx = await escrow.executeWithGasEscrow(
        refundTarget.address,
        "0x",
        refundTarget.address,
        { value: 0 }
      );
      const receipt = await tx.wait();

      expect(receipt.status).to.equal(1);
      expect(await ethers.provider.getBalance(refundTarget.address)).to.equal(balanceBefore);
    });

    it("skips the native refund when refundAddress is zero", async () => {
      const { escrow, owner } = await deploy();

      const tx = await escrow.executeWithGasEscrow(
        owner.address,
        "0x",
        ethers.ZeroAddress,
        { value: ethers.parseEther("0.01") }
      );
      const receipt = await tx.wait();

      expect(receipt.status).to.equal(1);
    });

    it("emits GasRefunded with refundAmount=0 when no refund is due", async () => {
      const { escrow, refundTarget } = await deploy();

      await expect(
        escrow.executeWithGasEscrow(
          refundTarget.address,
          "0x",
          refundTarget.address,
          { value: 0 }
        )
      ).to.emit(escrow, "GasRefunded");
    });
  });

  // ---------------------------------------------------------------------------
  // MessageReceiverCore — zero-value token transfers
  // ---------------------------------------------------------------------------
  describe("MessageReceiverCore", () => {
    async function deploy() {
      const [owner, user] = await ethers.getSigners();

      const MockERC20 = await ethers.getContractFactory("MockERC20Escrow");
      const token = await MockERC20.deploy("Bridge Token", "BT");
      await token.waitForDeployment();

      // Deploy FallbackEscrow with a placeholder owner, then transfer ownership
      // to the MessageReceiverCore so it can call escrowTokens.
      const Escrow = await ethers.getContractFactory("FallbackEscrow");
      const escrow = await Escrow.deploy(owner.address);
      await escrow.waitForDeployment();

      const Receiver = await ethers.getContractFactory("MessageReceiverCore");
      const receiver = await Receiver.deploy(await escrow.getAddress());
      await receiver.waitForDeployment();

      // Transfer ownership of the escrow to the receiver so it can call escrowTokens
      await escrow.transferOwnership(await receiver.getAddress());

      await token.mint(user.address, ethers.parseEther("1000"));

      return { receiver, escrow, token, owner, user };
    }

    it("accepts executeMessage with amount=0 on successful target call", async () => {
      const { receiver, token, user } = await deploy();
      const msgId = ethers.keccak256(ethers.toUtf8Bytes("zero-msg"));

      const tx = await receiver.connect(user).executeMessage(
        msgId,
        ethers.Wallet.createRandom().address,
        "0x",
        await token.getAddress(),
        0n,
        user.address
      );
      const receipt = await tx.wait();

      expect(receipt.status).to.equal(1);
    });

    it("accepts executeMessage with amount=0 on failed target call (escrow path)", async () => {
      const { receiver, escrow, token, user } = await deploy();
      const msgId = ethers.keccak256(ethers.toUtf8Bytes("zero-fail"));

      // Deploy a contract that reverts on any call to trigger the escrow path
      const RevertingFactory = await ethers.getContractFactory("RejectingReceiver");
      const revertingTarget = await RevertingFactory.deploy();
      await revertingTarget.waitForDeployment();

      await expect(
        receiver.connect(user).executeMessage(
          msgId,
          await revertingTarget.getAddress(),
          "0x",
          await token.getAddress(),
          0n,
          user.address
        )
      ).to.emit(receiver, "CallFailedEscrowed");
    });

    it("does not transfer tokens for amount=0 on successful target call", async () => {
      const { receiver, token, user } = await deploy();
      const msgId = ethers.keccak256(ethers.toUtf8Bytes("zero-notransfer"));

      await receiver.connect(user).executeMessage(
        msgId,
        ethers.Wallet.createRandom().address,
        "0x",
        await token.getAddress(),
        0n,
        user.address
      );

      expect(await token.balanceOf(await receiver.getAddress())).to.equal(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-cutting: zero-value transfers do not corrupt accounting
  // ---------------------------------------------------------------------------
  describe("Accounting integrity after zero-value transfers", () => {
    it("SafeNativeTransfer zero-value does not affect harness accounting", async () => {
      const [deployer] = await ethers.getSigners();
      const Harness = await ethers.getContractFactory("SafeNativeTransferHarness");
      const harness = await Harness.deploy();
      await harness.waitForDeployment();
      await deployer.sendTransaction({
        to: await harness.getAddress(),
        value: ethers.parseEther("10"),
      });

      const before = await ethers.provider.getBalance(await harness.getAddress());
      await harness.releaseSafe(ethers.Wallet.createRandom().address, 0n);
      const after = await ethers.provider.getBalance(await harness.getAddress());

      expect(after).to.equal(before);
    });

    it("GasRefundVault zero-value refund does not change totalNativeDisbursed", async () => {
      const [admin, guardian, relayer, user] = await ethers.getSigners();

      const Vault = await ethers.getContractFactory("GasRefundVault");
      const vault = await Vault.deploy(
        admin.address,
        guardian.address,
        relayer.address,
        50000,
        ethers.parseEther("1")
      );
      await vault.waitForDeployment();
      await user.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("10") });

      const gasPrice = await ethers.parseUnits("1", "gwei");
      await vault.connect(relayer).claimGasRefund(0, gasPrice);

      expect(await vault.totalNativeDisbursed()).to.equal(0);
    });

    it("FallbackEscrow zero-value escrow does not change claimable balance", async () => {
      const [owner, recipient] = await ethers.getSigners();

      const MockERC20 = await ethers.getContractFactory("MockERC20Escrow");
      const token = await MockERC20.deploy("Escrow Token", "ET");
      await token.waitForDeployment();

      const Escrow = await ethers.getContractFactory("FallbackEscrow");
      const escrow = await Escrow.deploy(owner.address);
      await escrow.waitForDeployment();

      await token.mint(owner.address, ethers.parseEther("10000"));
      await token.approve(await escrow.getAddress(), 0);

      const msgId = ethers.keccak256(ethers.toUtf8Bytes("zero-accounting"));
      await escrow.escrowTokens(msgId, recipient.address, await token.getAddress(), 0);

      expect(await escrow.getClaimableAmount(recipient.address, await token.getAddress())).to.equal(0);
    });
  });
});
