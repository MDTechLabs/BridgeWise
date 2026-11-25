# Emergency Withdrawal Entitlement Accounting Specification

**Status**: Normative Reference Specification  
**Tracking Issue**: #1549 ("Verify emergency withdrawal cannot bypass user entitlement accounting")  
**Target Component**: `contracts/execution/FallbackEscrow.sol`  
**Test Suite**: `test/execution/EmergencyWithdrawalEntitlement.test.ts`, `test/execution/EscrowSolvency.test.ts`  

---

## 1. Overview and Problem Statement

`FallbackEscrow` serves as the decentralized holding vault for cross-chain funds diverted when a destination execution fails. Each failed cross-chain message deposits the diverted tokens into the contract and records an accounting obligation (`claimable` balance per recipient, `totalEntitlements` per token). The rightful recipient can at any time claim their escrowed funds by keying on their unique `messageId`.

In administrative emergency procedures (e.g. recovering unintended airdrops, rescuing extraneous tokens sent to the contract address, or draining surplus capital deposited above tracked user obligations), bridge operators require an emergency withdrawal mechanism.

**Critical Safety Requirement**:
Emergency withdrawals MUST NOT under any circumstances bypass or diminish active user entitlement accounting. Surplus funds may only be withdrawn if and only if:
$$\text{heldBalance}(token) - \text{amount} \ge \text{totalEntitlements}(token)$$
Where:
- $\text{heldBalance}(token)$ is the physical ERC-20 token balance held by the escrow contract.
- $\text{totalEntitlements}(token)$ is the aggregate sum of all active, unclaimed user escrow deposits.

If an emergency withdrawal requests an amount exceeding unencumbered surplus, the transaction MUST revert atomically with `CannotBypassUserEntitlements(token, requested, availableSurplus)`.

---

## 2. Scope & Trust Boundaries

| Component | Responsibility / Trust Level | Security Assertion |
| :--- | :--- | :--- |
| **`FallbackEscrow`** | Manages escrow entries, tracks obligations, enforces emergency bounds. | Enforces invariants EW-1 through EW-8 in bytecode. |
| **Admin / Guardian** | Authorized multi-sig signer capable of initiating surplus recovery. | Cannot withdraw user entitlements even with full owner privileges. |
| **Recipient (User)** | Cross-chain transfer recipient whose execution failed. | Retains guaranteed claim rights to 100% of escrowed tokens at all times. |
| **ERC-20 Tokens** | Supported standard transfer assets across lanes. | Standard ERC-20 tokens (no unvetted fee-on-transfer / rebasing tokens). |

---

## 3. Formal Invariants (EW-1 through EW-8)

### Invariant EW-1: Physical Solvency Invariant
For every token $t$ and at any point in execution:
$$\text{balanceOf}(\text{address}(this)) \ge \text{totalEntitlements}[t]$$
No state transition may commit that results in $\text{balanceOf} < \text{totalEntitlements}$.

### Invariant EW-2: Strict Surplus Bounding
For any emergency withdrawal of amount $A$ of token $t$:
$$A \le \text{balanceOf}(\text{address}(this)) - \text{totalEntitlements}[t]$$
Any attempt to withdraw $A > \text{availableSurplus}$ MUST revert with `CannotBypassUserEntitlements(t, A, availableSurplus)`.

### Invariant EW-3: Non-Infringement of User Entitlements
Emergency withdrawals MUST NOT modify:
- `totalEntitlements[token]`
- `claimable[recipient][token]`
- `escrows[messageId].claimed`
- `escrows[messageId].amount`
User entitlement values are strictly invariant under emergency withdrawal execution.

### Invariant EW-4: Strict Role Authorization
Emergency withdrawal entrypoints (`emergencyWithdraw`) are strictly protected by `onlyOwner`. Non-owner or unauthorized callers MUST revert immediately with `OwnableUnauthorizedAccount`.

### Invariant EW-5: Reentrancy Immunity
Both `emergencyWithdraw` and `claimEscrowedTokens` are protected with `nonReentrant`. Reentrancy attacks attempting to hijack token control flow or drain double allocations revert immediately.

### Invariant EW-6: Idempotent & Replay-Resistant Claims
A `messageId` can be escrowed at most once (`AlreadyEscrowed`) and claimed at most once (`NothingToClaim`). Emergency withdrawals cannot reset or mutate claimed status.

### Invariant EW-7: Entitlement Claim Liveness
User claims remain active, protected, and fully redeemable regardless of whether an emergency withdrawal has occurred or is pending.

### Invariant EW-8: Cross-Chain Profile Portability
The accounting invariants hold uniformly across all supported BridgeWise EVM deployment profiles and cross-domain architectures.

---

## 4. Multi-Chain Profile Matrix

| Chain Profile | Network | Finality Depth | Reorg Window | Target Max Gas | Max Amount |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `evm:1` | Ethereum Mainnet | 12 blocks | 64 blocks | 100,000 gas | $10^{30}$ |
| `evm:10` | Optimism Mainnet | 1 block | 10 blocks | 100,000 gas | $10^{30}$ |
| `evm:56` | BNB Smart Chain | 15 blocks | 50 blocks | 100,000 gas | $10^{30}$ |
| `evm:137` | Polygon PoS | 128 blocks | 256 blocks | 100,000 gas | $10^{30}$ |
| `evm:8453` | Base Mainnet | 6 blocks | 20 blocks | 100,000 gas | $10^{30}$ |
| `evm:42161` | Arbitrum One | 1 block | 10 blocks | 100,000 gas | $10^{30}$ |
| `soroban:stellar`| Stellar Network | 1 ledger | 1 ledger | N/A (Rust/Soroban) | $2^{63}-1$ |

---

## 5. Threat Model and Verification

1. **Malicious Guardian Attack**: An administrator key is compromised or rogue guardian attempts to drain user funds via emergency withdrawal.
   - *Mitigation*: The smart contract calculates `availableSurplus = held - totalEntitlements` in the transaction frame and restricts withdrawal strictly to `amount <= availableSurplus`. User funds are physically unwithdrawable by the admin.
2. **Reentrancy via Malicious Token**: An ERC-20 implementation re-enters `claimEscrowedTokens` or `emergencyWithdraw` during `safeTransfer`.
   - *Mitigation*: `ReentrancyGuard` modifier protects all state-changing entrypoints.
3. **Replay & Double-Spend**: Attacker replays a previously executed claim or emergency withdrawal.
   - *Mitigation*: `claimed` state is set before transfer; subsequent claims revert with `NothingToClaim`. Available surplus is decremented, causing subsequent duplicate withdrawals to revert with `CannotBypassUserEntitlements`.

---

## 6. Worst-Case Gas Analysis

| Function Call | Cold Storage Gas | Warm Storage Gas | Target Gas Bound |
| :--- | :---: | :---: | :---: |
| `emergencyWithdraw` (full surplus) | ~52,000 | ~34,000 | < 100,000 gas |
| `claimEscrowedTokens` (first claim) | ~68,000 | ~45,000 | < 100,000 gas |
| `escrowTokens` (new message) | ~85,000 | ~62,000 | < 120,000 gas |

---

## 7. Operator Emergency Recovery Runbook

1. **Surplus Verification**:
   Inspect available surplus on target contract before submitting withdrawal:
   ```typescript
   const surplus = await fallbackEscrow.getAvailableSurplus(tokenAddress);
   console.log(`Unencumbered surplus available for rescue: ${surplus.toString()}`);
   ```
2. **Execute Emergency Withdrawal**:
   Submit multi-sig proposal targeting `emergencyWithdraw(token, destination, amount)`.
   Ensure `amount <= surplus`.
3. **Post-Execution Invariant Assertion**:
   Run automated reconciliation assertion:
   ```typescript
   const held = await token.balanceOf(await fallbackEscrow.getAddress());
   const entitlements = await fallbackEscrow.totalEntitlements(tokenAddress);
   assert(held >= entitlements, "CRITICAL: Solvency deficit detected!");
   ```
