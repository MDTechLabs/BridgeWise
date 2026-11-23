# Token Adapter Risk, Approval Guard & Asset Reconciliation Specification

- **Workstream**: Oracle, Liquidity and Asset Risk
- **Repository**: `MDTechLabs/BridgeWise`
- **Specification Version**: `1.0.0`
- **Applicable Issues**: #1485, #1486, #1488, #1489
- **Status**: Normative / Production Hardened

---

## 1. Executive Summary & Objectives

Cross-chain bridge adapters handle token transfers between native blockchains, router contracts, escrow vaults, and external liquidity pools. Three primary attack vectors and accounting failure modes threaten cross-chain asset safety:

1. **Arbitrary Token Approval Growth (#1485, #1486)**:
   Adapters granting unbounded `type(uint256).max` allowances or allowing accumulated allowance creep leave bridge assets vulnerable if an external spender, router, or downstream DEX adapter is compromised. Allowances must be strictly bounded, exact-on-demand, safe-reset compliant, capped by per-transaction and cumulative limits, and cleared back to zero post-transfer.

2. **Malicious Token Callbacks & Reentrancy Attacks (#1488)**:
   Non-standard and callback-enabled tokens (ERC-777 `tokensReceived`/`tokensToSend`, ERC-1363 `onTransferReceived`/`onApprovalReceived`, and arbitrary contract fallbacks) attempt to hijack execution flow to reenter bridge adapters during deposit, lock, refund, or settlement. Bridge adapters must enforce strict Checks-Effects-Interactions (CEI), mutual exclusion reentrancy locks, transient replay guards, and atomic rollback on any callback failure.

3. **Rebasing and Fee-on-Transfer (FoT) Asset Discrepancies (#1489)**:
   Bridge accounting that relies on nominal input amounts rather than actual balance changes ($\Delta = \text{balanceAfter} - \text{balanceBefore}$) causes unbacked wrapped liabilities and immediate bridge insolvency. Similarly, elastic supply (rebasing) tokens experience balance drift that threatens escrow solvency. The bridge must reconcile physical balances, reject zero/sub-minimum deltas, and classify drift safely.

---

## 2. Invariants Specification

The following normative invariants are enforced across all bridge adapters, reconciliation engines, and execution paths:

| Invariant ID | Name | Description |
| :--- | :--- | :--- |
| `A-1` | **Allowance Exactness & Non-Growth** | An adapter must never grant `type(uint256).max` without explicit policy opt-in. Allowances granted to spenders must equal the exact amount required for the immediate operation ($\text{allowance} = \text{amount}$). |
| `A-2` | **Safe Reset-Before-Set** | Prior to setting an allowance for non-standard ERC-20 tokens (e.g. USDT) that revert on non-zero allowance updates, existing allowance must be explicitly reset to zero before the new value is granted. |
| `A-3` | **Cumulative & Single-Tx Approval Caps** | Total active and cumulative approvals for any (token, spender) pair must not exceed the configured `maxSingleApprovalLimit` and `cumulativeAllowanceCap`. |
| `A-4` | **Post-Execution Zero Allowance Sweep** | Following an external transfer or adapter swap, any remaining unused allowance on the spender must be swept back to zero (`allowance == 0`), preventing dangling allowance accumulation. |
| `A-5` | **Emergency Allowance Revocation** | Authorized Operator and Guardian roles must be able to atomically revoke all allowances to zero for any token, spender, or adapter without upgrading bytecode. |
| `A-6` | **Malicious Callback Reentrancy Isolation** | Reentrancy attempts via token hooks (ERC-777, ERC-1363, fallback) during deposit, claim, or refund must revert immediately, leaving zero state mutations. |
| `A-7` | **Actual Balance Delta Reconciliation** | For any inbound deposit or transfer, credit and bridge liabilities must equal the measured physical balance change: $\Delta = \text{balanceAfter} - \text{balanceBefore}$. Nominal amounts must never be credited blindly. |
| `A-8` | **Zero / Sub-Minimum Delta Rejection** | If $\Delta = 0$ (e.g. 100% burn tax, malicious token transfer) or $\Delta < \text{minAmountExpected}$ (slippage violation), the transaction must revert fail-closed. |
| `A-9` | **Rebasing Invariant & Drift Solvency** | Total liabilities for any escrowed asset must not exceed physical balance: $\sum \text{liabilities} \le \text{balanceOf}(\text{escrow})$. Drift is tracked; negative drift triggers containment/freeze before insolvency occurs. |
| `A-10` | **Deterministic Replay & Caller Containment** | Replayed messages, duplicate sequence identifiers, and unauthorized callers must revert atomically without altering allowances, balances, or reconciliation state. |

---

## 3. Scope & System Architecture

### Affected Contracts and Components
- `contracts/tokens/BridgeAdapterApprovalGuard.sol`: On-chain approval manager that enforces exact allowances, zero-resets, cumulative budgets, and post-call zero sweeps.
- `contracts/tokens/TokenAdapterReconciler.sol`: Balance delta reconciliation module enforcing $\Delta$-based accounting and callback safety.
- `contracts/tokens/SafeApprovalHandler.sol`: Base reset-and-approve helper.
- `contracts/bridge/BridgeGateway.sol`: Deposit gateway updated to use delta reconciliation and approval guards.
- `contracts/execution/FallbackEscrow.sol`: Escrow recovery and claim target protected against reentrant callbacks.
- `scripts/token-adapter-risk.ts`: Executable normative model for adapter risk, approval growth, and asset reconciliation.

### Authorization Boundaries & Roles
- **DEFAULT_ADMIN_ROLE**: Configures token caps, allowance limits, and supported asset classifications.
- **GUARDIAN_ROLE**: Emergency role capable of freezing adapters and executing instant allowance revocations (`revokeAllAllowances`).
- **ADAPTER_EXECUTOR_ROLE**: Authorized relayer/engine allowed to request single-operation bounded approvals.
- **UNTRUSTED**: User depositors, token contracts, external DEX routers, and destination recipients.

---

## 4. Versioned Chain Profiles

Chain-specific parameters are explicit, versioned, and never inferred from untrusted RPCs or relayers:

| Chain Identifier | Name | Finality Depth | Reorg Window | Max Tx Allowance Cap | Default Max FoT Fee Bps | Parameter Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `evm:1` | Ethereum Mainnet | 12 blocks | 64 blocks | $10^9 \times 10^{18}$ | 500 bps (5%) | `asset-risk/1.0.0` |
| `evm:137` | Polygon PoS | 128 blocks | 256 blocks | $10^9 \times 10^{18}$ | 500 bps (5%) | `asset-risk/1.0.0` |
| `evm:56` | BNB Smart Chain | 15 blocks | 50 blocks | $10^9 \times 10^{18}$ | 1000 bps (10%) | `asset-risk/1.0.0` |
| `evm:42161` | Arbitrum One | 1 block | 10 blocks | $10^9 \times 10^{18}$ | 500 bps (5%) | `asset-risk/1.0.0` |
| `evm:10` | OP Mainnet | 1 block | 10 blocks | $10^9 \times 10^{18}$ | 500 bps (5%) | `asset-risk/1.0.0` |
| `evm:8453` | Base | 6 blocks | 20 blocks | $10^9 \times 10^{18}$ | 500 bps (5%) | `asset-risk/1.0.0` |
| `soroban:stellar` | Stellar Soroban | 1 ledger | 1 ledger | $(2^{63}-1)$ | 0 bps (disabled) | `asset-risk/1.0.0` |

---

## 5. Adversarial Scenarios & Mitigations

### 5.1 Arbitrary Approval Growth Attacks
- **Scenario**: A malicious or exploited DEX router requests infinite approval from the bridge adapter, or calls `approve()` incrementally across thousands of bridge operations.
- **Defense**: The `BridgeAdapterApprovalGuard` rejects any approval exceeding `maxSingleApprovalLimit` or `cumulativeAllowanceCap`. Furthermore, after every external transfer execution, the adapter invokes `sweepAllowanceToZero()`. Any leftover allowance is reset to 0.

### 5.2 Malicious Token Callback Attacks (ERC-777, ERC-1363, Reentrancy)
- **Scenario**: An attacker creates an ERC-777 token that implements `tokensReceived()`. When `safeTransferFrom` transfers tokens into the adapter/escrow, `tokensReceived()` re-enters `BridgeGateway.deposit()` or `FallbackEscrow.claimEscrowedTokens()`.
- **Defense**: 
  - Non-reentrant mutual exclusion guards prevent reentering any mutating function.
  - State variables (`claimed = true`, balances, and locks) are mutated *before* the external token transfer (CEI pattern).
  - Any reentrant call reverts immediately with `ReentrancyGuardReentrantCall()`.

### 5.3 Fee-On-Transfer (FoT) Exploits
- **Scenario**: A user deposits 10,000 tokens of a deflationary token that charges a 10% transfer tax. The bridge vault receives 9,000 tokens, but mints/records 10,000 tokens on the destination chain. The bridge is instantly under-collateralized by 1,000 tokens.
- **Defense**:
  - `TokenAdapterReconciler` measures `before = token.balanceOf(vault)` and `after = token.balanceOf(vault)`.
  - The credited amount is strictly $\Delta = after - before = 9,000$.
  - The destination message instructs the receiver to mint/unlock exactly 9,000 tokens minus protocol bridge fees.
  - If $\Delta == 0$ or fee exceeds allowable bps, transaction reverts.

### 5.4 Rebasing Discrepancies
- **Scenario**: An elastic token experiences negative rebasing (slashing or balance deflation), causing physical vault balance to drop below recorded liabilities.
- **Defense**:
  - Continuous drift tracking compares physical balance against tracked liabilities.
  - Negative drift triggers `DriftStatus::SHORTFALL` and automatically flags or pauses new outbound claims for that asset until operator reserve replenishment.
  - Positive drift (yield/surplus) is credited to an audit-monitored protocol reserve.

---

## 6. Migration, Monitoring & Operator Recovery

1. **Monitoring**:
   - Telemetry tracks `AllowanceGranted`, `AllowanceZeroed`, and `EmergencyRevocation` events.
   - Alerts trigger if any adapter maintains a non-zero allowance for longer than the transaction duration.
   - Balance drift monitoring runs on every block/ledger to ensure $\sum \text{liabilities} \le \text{vaultBalance}$.

2. **Operator Recovery**:
   - If an adapter or downstream router contract is compromised, the Guardian triggers `revokeAllAllowances(token, spender)` in a single transaction.
   - For rebasing shortfalls, the operator deposits reserve funds to re-balance the ledger prior to unfreezing claims.

3. **Audit & Safety Boundary**:
   - Passing automated tests does not replace independent smart contract security review.
   - No production private keys or unverified RPC endpoints are used in tests or deployment.
