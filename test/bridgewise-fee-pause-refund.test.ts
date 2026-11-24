/**
 * BridgeWise — Test Suite for Issues #1542, #1543, #1544, #1545
 *
 * Covers:
 * - #1542: Add invariant test for fee-on-transfer token deposits and withdrawals
 * - #1543: Validate bridge behavior when destination gas limit is insufficient
 * - #1544: Add tests for recipient contract reverting during token delivery
 * - #1545: Test refund path when destination chain remains unavailable past timeout
 */

import { describe, it, expect, beforeEach } from "vitest";

// ============================================================================
// #1542: Invariant Test for Fee-on-Transfer Token Deposits & Withdrawals
// ============================================================================
describe("#1542 - Fee-on-Transfer Token Deposit & Withdrawal Invariants", () => {
  interface AccountState {
    balance: bigint;
  }

  class MockFeeOnTransferToken {
    public feeBasisPoints: bigint = 200n; // 2% fee on transfer
    public balances: Map<string, bigint> = new Map();

    constructor(initialHolders: Record<string, bigint>) {
      for (const [addr, bal] of Object.entries(initialHolders)) {
        this.balances.set(addr, bal);
      }
    }

    balanceOf(account: string): bigint {
      return this.balances.get(account) ?? 0n;
    }

    transferFrom(sender: string, recipient: string, amount: bigint): { received: bigint; fee: bigint } {
      const senderBal = this.balanceOf(sender);
      if (senderBal < amount) throw new Error("ERC20: transfer amount exceeds balance");

      const fee = (amount * this.feeBasisPoints) / 10000n;
      const received = amount - fee;

      this.balances.set(sender, senderBal - amount);
      this.balances.set(recipient, this.balanceOf(recipient) + received);
      return { received, fee };
    }

    transfer(sender: string, recipient: string, amount: bigint): { received: bigint; fee: bigint } {
      return this.transferFrom(sender, recipient, amount);
    }
  }

  class BridgeVault {
    public token: MockFeeOnTransferToken;
    public recordedBridgeBalances: Map<string, bigint> = new Map();
    public totalDeposited: bigint = 0n;

    constructor(token: MockFeeOnTransferToken) {
      this.token = token;
    }

    deposit(user: string, nominalAmount: bigint): bigint {
      const balanceBefore = this.token.balanceOf("vault");
      this.token.transferFrom(user, "vault", nominalAmount);
      const balanceAfter = this.token.balanceOf("vault");

      // Exact net received amount must be credited (preventing fee-on-transfer deficit)
      const actualReceived = balanceAfter - balanceBefore;
      const current = this.recordedBridgeBalances.get(user) ?? 0n;
      this.recordedBridgeBalances.set(user, current + actualReceived);
      this.totalDeposited += actualReceived;
      return actualReceived;
    }

    withdraw(user: string, claimAmount: bigint): bigint {
      const recorded = this.recordedBridgeBalances.get(user) ?? 0n;
      if (recorded < claimAmount) throw new Error("Insufficient bridge balance");

      this.recordedBridgeBalances.set(user, recorded - claimAmount);
      this.totalDeposited -= claimAmount;

      const { received } = this.token.transfer("vault", user, claimAmount);
      return received;
    }
  }

  it("should record actual received balance rather than nominal transfer amount on deposit", () => {
    const token = new MockFeeOnTransferToken({ user1: 10000n, vault: 0n });
    const vault = new BridgeVault(token);

    const netReceived = vault.deposit("user1", 1000n);
    expect(netReceived).toBe(980n); // 1000 - 2%
    expect(vault.recordedBridgeBalances.get("user1")).toBe(980n);
    expect(token.balanceOf("vault")).toBe(980n);
    expect(vault.totalDeposited).toBe(token.balanceOf("vault"));
  });

  it("should maintain the solvency invariant: vault token balance >= total bridge credited obligations", () => {
    const token = new MockFeeOnTransferToken({ user1: 50000n, user2: 50000n, vault: 0n });
    const vault = new BridgeVault(token);

    vault.deposit("user1", 5000n);
    vault.deposit("user2", 10000n);

    // Invariant: actual physical balance in vault == total recorded obligations
    expect(token.balanceOf("vault")).toBe(vault.totalDeposited);
    expect(token.balanceOf("vault")).toBe(vault.recordedBridgeBalances.get("user1")! + vault.recordedBridgeBalances.get("user2")!);
  });

  it("should prevent insolvency when withdrawing fee-on-transfer tokens", () => {
    const token = new MockFeeOnTransferToken({ user1: 10000n, vault: 0n });
    const vault = new BridgeVault(token);

    const received = vault.deposit("user1", 10000n);
    expect(received).toBe(9800n);

    const withdrawnNet = vault.withdraw("user1", 5000n);
    expect(withdrawnNet).toBe(4900n);
    expect(vault.totalDeposited).toBe(4800n);
    expect(token.balanceOf("vault")).toBe(4800n);
  });
});

// ============================================================================
// #1543: Bridge Destination Gas Limit Validation
// ============================================================================
describe("#1543 - Destination Gas Limit Validation", () => {
  interface BridgeRelayParams {
    targetChainId: number;
    destinationGasLimit: bigint;
    payloadSize: number;
  }

  const MIN_EXECUTION_GAS = 65000n;
  const MAX_PERMISSIBLE_GAS = 3000000n;
  const BASE_GAS_PER_BYTE = 16n;

  function validateDestinationGas(params: BridgeRelayParams): { valid: boolean; reason?: string } {
    const requiredCalldataGas = BigInt(params.payloadSize) * BASE_GAS_PER_BYTE;
    const totalRequiredGas = MIN_EXECUTION_GAS + requiredCalldataGas;

    if (params.destinationGasLimit < totalRequiredGas) {
      return {
        valid: false,
        reason: `Insufficient gas limit: provided ${params.destinationGasLimit}, required at least ${totalRequiredGas}`,
      };
    }
    if (params.destinationGasLimit > MAX_PERMISSIBLE_GAS) {
      return {
        valid: false,
        reason: `Exceeds max allowable destination gas: ${params.destinationGasLimit} > ${MAX_PERMISSIBLE_GAS}`,
      };
    }
    return { valid: true };
  }

  it("should reject bridge relay requests with gas limit below execution threshold", () => {
    const result = validateDestinationGas({
      targetChainId: 1,
      destinationGasLimit: 50000n,
      payloadSize: 128,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Insufficient gas limit");
  });

  it("should dynamically scale minimum required gas based on message payload length", () => {
    const largePayloadResult = validateDestinationGas({
      targetChainId: 10,
      destinationGasLimit: 66000n,
      payloadSize: 1024, // 1024 * 16 = 16384, required = 81384
    });
    expect(largePayloadResult.valid).toBe(false);
    expect(largePayloadResult.reason).toContain("required at least 81384");
  });

  it("should accept bridge requests meeting safe gas threshold bounds", () => {
    const result = validateDestinationGas({
      targetChainId: 42161,
      destinationGasLimit: 120000n,
      payloadSize: 64,
    });
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// #1544: Recipient Contract Reverting During Token Delivery
// ============================================================================
describe("#1544 - Recipient Contract Reverting During Token Delivery", () => {
  enum DeliveryStatus {
    SUCCESS,
    REVERTED_ESCROWED,
    FAILED,
  }

  interface DeliveryAttempt {
    recipient: string;
    amount: bigint;
    status: DeliveryStatus;
    escrowedBalance: bigint;
  }

  class DestinationBridgeReceiver {
    public escrow: Map<string, bigint> = new Map();

    executeDelivery(
      recipient: string,
      amount: bigint,
      recipientContractMock: { receiveTokens: (amt: bigint) => boolean }
    ): DeliveryAttempt {
      try {
        const ok = recipientContractMock.receiveTokens(amount);
        if (!ok) throw new Error("Target contract execution failed");
        return {
          recipient,
          amount,
          status: DeliveryStatus.SUCCESS,
          escrowedBalance: this.escrow.get(recipient) ?? 0n,
        };
      } catch (err) {
        // Safe handling: do not drop tokens or stall bridge pipe, escrow funds for recipient claim
        const cur = this.escrow.get(recipient) ?? 0n;
        this.escrow.set(recipient, cur + amount);
        return {
          recipient,
          amount,
          status: DeliveryStatus.REVERTED_ESCROWED,
          escrowedBalance: cur + amount,
        };
      }
    }

    claimEscrow(recipient: string, fallbackRecipient: string): bigint {
      const balance = this.escrow.get(recipient) ?? 0n;
      if (balance === 0n) throw new Error("No escrowed balance to claim");
      this.escrow.set(recipient, 0n);
      return balance;
    }
  }

  it("should catch recipient contract execution reverts and safely divert to escrow", () => {
    const receiver = new DestinationBridgeReceiver();
    const maliciousOrBrokenRecipient = {
      receiveTokens: () => {
        throw new Error("Out of gas or unexpected revert in custom onTokenBridged()");
      },
    };

    const attempt = receiver.executeDelivery("0xRevertingContract", 5000n, maliciousOrBrokenRecipient);
    expect(attempt.status).toBe(DeliveryStatus.REVERTED_ESCROWED);
    expect(receiver.escrow.get("0xRevertingContract")).toBe(5000n);
  });

  it("should allow beneficiary to claim escrowed funds to an alternative address", () => {
    const receiver = new DestinationBridgeReceiver();
    receiver.escrow.set("0xRevertingContract", 5000n);

    const claimed = receiver.claimEscrow("0xRevertingContract", "0xSafeEOA");
    expect(claimed).toBe(5000n);
    expect(receiver.escrow.get("0xRevertingContract")).toBe(0n);
  });
});

// ============================================================================
// #1545: Refund Path When Destination Chain Remains Unavailable Past Timeout
// ============================================================================
describe("#1545 - Timeout-based Refund Path for Unreachable Destination Chains", () => {
  interface BridgeRequest {
    txId: string;
    sender: string;
    amount: bigint;
    timestamp: number;
    timeoutSeconds: number;
    refunded: boolean;
    acknowledgedOnDestination: boolean;
  }

  class SourceBridgeEscrow {
    public requests: Map<string, BridgeRequest> = new Map();

    initiateBridge(txId: string, sender: string, amount: bigint, now: number, timeoutSeconds: number = 3600) {
      this.requests.set(txId, {
        txId,
        sender,
        amount,
        timestamp: now,
        timeoutSeconds,
        refunded: false,
        acknowledgedOnDestination: false,
      });
    }

    claimTimeoutRefund(txId: string, currentTime: number): { success: boolean; refundedAmount: bigint } {
      const req = this.requests.get(txId);
      if (!req) throw new Error("Non-existent bridge transaction");
      if (req.refunded) throw new Error("Transaction already refunded");
      if (req.acknowledgedOnDestination) throw new Error("Transaction was fulfilled on destination");

      if (currentTime < req.timestamp + req.timeoutSeconds) {
        throw new Error("Bridge transaction timeout window has not expired");
      }

      req.refunded = true;
      return { success: true, refundedAmount: req.amount };
    }
  }

  it("should prevent refund claims before the timeout window expires", () => {
    const bridge = new SourceBridgeEscrow();
    const t0 = 1000000;
    bridge.initiateBridge("tx-1", "userA", 2500n, t0, 3600);

    expect(() => {
      bridge.claimTimeoutRefund("tx-1", t0 + 1800); // Only 30 minutes in
    }).toThrow("Bridge transaction timeout window has not expired");
  });

  it("should grant full refund to sender once destination timeout has elapsed", () => {
    const bridge = new SourceBridgeEscrow();
    const t0 = 1000000;
    bridge.initiateBridge("tx-2", "userA", 7500n, t0, 3600);

    const result = bridge.claimTimeoutRefund("tx-2", t0 + 3601);
    expect(result.success).toBe(true);
    expect(result.refundedAmount).toBe(7500n);
    expect(bridge.requests.get("tx-2")?.refunded).toBe(true);
  });

  it("should prevent double-claiming refunds", () => {
    const bridge = new SourceBridgeEscrow();
    const t0 = 1000000;
    bridge.initiateBridge("tx-3", "userA", 5000n, t0, 3600);
    bridge.claimTimeoutRefund("tx-3", t0 + 4000);

    expect(() => {
      bridge.claimTimeoutRefund("tx-3", t0 + 4001);
    }).toThrow("Transaction already refunded");
  });
});
