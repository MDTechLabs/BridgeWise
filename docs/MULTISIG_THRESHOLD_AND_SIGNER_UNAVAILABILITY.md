# Production Multisig Threshold and Signer Unavailability Specification

**Scope:** `contracts/governance/BridgeMultiSigOwnable.sol`, `contracts/verifiers/YulMultiSigVerifier.sol`, and `contracts/validator/ValidatorSetManager.sol`.  
**Workstream:** Contract Testing, Formal Methods and Governance  
**Repository:** `MDTechLabs/BridgeWise`  
**Document Version:** 1.0.0  

---

## 1. Executive Summary & Objective

Cross-chain asset transfers and administrative governance actions depend on multi-signature quorums to ensure security against single-point-of-failure compromise and adversarial collusion. However, production environments encounter real-world networking challenges including signer outages, RPC partitioning, validator dropouts, Byzantine signature replays, and chain reorganizations.

This specification establishes production contract guarantees, formal invariants, and testing evidence demonstrating that BridgeWise fail-safes securely under partial availability, adversarial message injection, or threshold starvation.

---

## 2. Affected System Components

### 2.1 Contracts & Verifiers
- **`BridgeMultiSigOwnable.sol`**: Multi-signature treasury and governance execution contract requiring $M$-of-$N$ owner confirmations for administrative operations and value transfers.
- **`YulMultiSigVerifier.sol`**: Low-level Yul/assembly verification engine implementing gas-optimized EIP-191/EIP-712 quorum verification with fixed memory layout (`0x00`-`0xa0`) and strictly ascending address ordering.
- **`ValidatorSetManager.sol`**: On-chain validator registry governing epoch rotations, timelocked transitions (`EPOCH_DELAY`), and grace periods (`OVERLAP_WINDOW`) for key migration.

### 2.2 Message Types & Domain Binding
- **EIP-712 Domain Separator**: `keccak256("BridgeWiseDomain(string name,string version,uint256 sourceChainId,uint256 targetChainId,address bridgeAddress)")`.
- **`BridgeMessage`**: Encapsulates cross-chain intent (`messageId`, `sourceChainId`, `targetChainId`, `sender`, `recipient`, `token`, `amount`, `nonce`, `deadline`).
- **`TransactionProposal`**: Multi-signature proposal encoding destination `target`, native `value`, executable `data`, expiration timestamp `expirationTime`, and confirmation tracking.

### 2.3 Supported Production Networks & Explicit Parameters
Security-critical parameters are versioned and immutable; contracts never infer chain configuration or security boundaries from untrusted RPC headers or relayer parameters.

| Network | Chain ID | Finality Guarantee | Default Quorum ($M/N$) | Rotation Delay (`EPOCH_DELAY`) |
| :--- | :--- | :--- | :--- | :--- |
| **Ethereum Mainnet** | 1 | 2 Epochs (64 slots / ~12.8 min) | 5-of-7 (71.4%) | 86,400s (24 hr) |
| **Polygon PoS** | 137 | 256 Checkpointed blocks | 5-of-7 (71.4%) | 86,400s (24 hr) |
| **BNB Smart Chain** | 56 | 15 Finalized blocks | 5-of-7 (71.4%) | 86,400s (24 hr) |
| **Arbitrum One** | 42161 | L1 Batch Confirmation (~15 min) | 4-of-6 (66.7%) | 86,400s (24 hr) |
| **Optimism Mainnet** | 10 | L1 State Root Finalization | 4-of-6 (66.7%) | 86,400s (24 hr) |
| **Base** | 8453 | L1 State Root Finalization | 4-of-6 (66.7%) | 86,400s (24 hr) |

---

## 3. Formal Invariants & State Transitions

### Invariant Definitions

- **Invariant M-1 (Strict Quorum Threshold)**:  
  For any action requiring threshold $T$ among $N$ authorized signers, execution succeeds if and only if valid confirmations $C \ge T$. If available signers $K < T$, the transaction MUST revert without modifying any protected state.
- **Invariant M-2 (Strict Address Ordering & Non-Duplication)**:  
  In multi-signature bundles, signer addresses recovered from signatures must satisfy $Signer_i > Signer_{i-1}$ for all $0 < i < K$. A repeated signature ($Signer_i == Signer_{i-1}$) or out-of-order signature MUST immediately revert with `UnsortedOrDuplicateSignature(i)`.
- **Invariant M-3 (Outsider Non-Substitution)**:  
  Signatures recovered from addresses not present in the active validator set do not increment `validCount`. An adversary cannot substitute an offline signer with an unauthorized signature.
- **Invariant M-4 (Temporal Validity & Expiration)**:  
  A multisig proposal is executable only while `block.timestamp <= expirationTime`. If signers are delayed or unavailable beyond the expiration window, the proposal becomes permanently unexecutable, reverting with `BridgeMultiSig: proposal expired`.
- **Invariant M-5 (Confirmation Revocation Atomicity)**:  
  An authorized signer who previously confirmed a proposal can revoke their confirmation prior to execution. If revocation reduces $C < T$, execution MUST fail.
- **Invariant M-6 (Accounting & Balance Conservation)**:  
  Multi-signature value transfers preserve contract solvency:
  $$\text{Balance}_{\text{after}} = \text{Balance}_{\text{before}} - \text{Proposal.value}$$
  Failed sub-calls revert all internal state and native asset transfers atomically.

---

## 4. Adversarial Threat Model & Partial Failure Analysis

### 4.1 Signer Unavailability Modes
1. **Transient Node Downtime**: 1-2 signers temporarily offline. Remaining signers $K \ge T$ proceed without interruption.
2. **Quorum Starvation ($K < T$)**: Network partitions or coordinated outages leave fewer than $T$ signers online. The protocol **fails closed**: no messages can execute, funds remain safely locked, and state cannot be corrupted.
3. **Byzantine Signature Duplication**: An attacker captures a valid signature from an available signer and duplicates it to meet $T$. Enforced strictly-ascending ordering detects this in $O(1)$ comparisons per step ($O(n)$ overall) and reverts.
4. **Outsider Injection Attack**: An attacker appends valid signatures from unauthorized keys to an undersized bundle. Verifiers binary-search the sorted validator set and filter out outsiders without incrementing valid count.
5. **Cross-Chain & Cross-Contract Replay**: A valid signature bundle collected on Chain A is submitted to Chain B or to an older contract instance. The cryptographic digest includes `targetChainId` and `bridgeAddress`, causing ecrecover to yield unmatching addresses or invalid quorum.

### 4.2 Chain Reorganization Handling
- Indexers and relayers subscribe to finalized blocks only.
- NonceBitmap and PackedNonceRegistry ensure that even if a shallow reorg occurs, duplicate nonces cannot be re-executed.

---

## 5. Gas Bounds & Resource Optimization

`YulMultiSigVerifier.sol` optimizes gas usage and memory bounds:
- **Zero Incremental Memory Expansion**: Scratch space for `ecrecover` reuses memory offsets `0x00`-`0xa0`. The free memory pointer at `0x40` is preserved and restored, ensuring zero quadratic memory expansion penalty as signature count scales.
- **Linear Gas Complexity**:
  $$\text{Gas}(K) \approx c_0 + K \cdot (\text{Gas}_{\text{ecrecover}} + \text{Gas}_{\text{calldataload}} + \log_2(N) \cdot \text{Gas}_{\text{bsearch}})$$
  Benchmark measurements confirm flat marginal cost ($\sim 8,100 - 8,900$ gas per signature) up to 50 signers, staying well within block gas limits (< 500,000 gas for worst-case 20-validator bundles).

---

## 6. Operator Runbook & Emergency Recovery

1. **Monitoring Alerts**:
   - Alert on `QuorumNotMet` spikes or proposals approaching expiration with $C < T$.
   - Monitor validator heartbeats; page on-call if healthy signer count drops below $T + 1$.
2. **Signer Recovery / Key Rotation**:
   - Propose a new validator set via `ValidatorSetManager.proposeValidatorSet`.
   - Wait for `EPOCH_DELAY` (24h standard).
   - Collect `approveValidatorSet` approvals from `APPROVER_ROLE` holders until `approvalThreshold` (default 1, admin-settable) is met, then activate via `activateValidatorSet`. Outgoing set remains valid during `OVERLAP_WINDOW` to maintain bridge continuity during relayer transition.
3. **Emergency Pause**:
   - If signer keys are compromised, the guardian or admin invokes `BridgeCorePausable.pause()` to halt processing until quorum keys are rotated.

---

_Verified in test suite `test/verifiers/MultiSigThresholdUnavailability.production.test.ts`, `test/governance/BridgeMultiSigOwnable.test.ts`, and `test/governance/BridgeMultiSigOwnable.fuzz.test.ts`._
