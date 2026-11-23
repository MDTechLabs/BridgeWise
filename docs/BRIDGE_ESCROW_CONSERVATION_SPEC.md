# Bridge Escrow Conservation Specification

Status: normative reference specification for bridge escrow accounting (issue #1533).
Version: `escrow-conservation/1.0.0`.
Executable model: [`scripts/bridge-escrow-conservation.ts`](../scripts/bridge-escrow-conservation.ts).
Executable evidence: [`scripts/bridge-escrow-conservation.spec.ts`](../scripts/bridge-escrow-conservation.spec.ts) and [`test/execution/BridgeEscrowConservation.integration.test.ts`](../test/execution/BridgeEscrowConservation.integration.test.ts).

This document specifies what every BridgeWise escrow implementation MUST satisfy when it locks, delivers, refunds, retries or recovers a cross-chain transfer. It is a specification and a verification harness, **not** a substitute for an independent contract audit or for the threat-model review required by [VALIDATOR_QUORUM_LOSS_RECOVERY_RUNBOOK.md](./VALIDATOR_QUORUM_LOSS_RECOVERY_RUNBOOK.md). This change does not alter a deployed contract or a trust boundary; it makes the expected behavior explicit and continuously checked.

## 1. Scope and affected components

| Area | Component / state | Relevant transitions |
| --- | --- | --- |
| EVM fallback escrow | [`FallbackEscrow.sol`](../contracts/execution/FallbackEscrow.sol): `escrows[messageId]{amount,token,claimed}`, `claimable[recipient][token]`, `recipientMessages[recipient]` | `escrowTokens`, `claimEscrowedTokens` |
| EVM receiver adapter | [`MessageReceiverCore.sol`](../contracts/execution/MessageReceiverCore.sol): `executeMessage`, `_escrowTokens`, `CallFailedEscrowed` | destination revert → escrow |
| EVM execution / gas | [`DurableOrchestrator.sol`](../contracts/execution/DurableOrchestrator.sol), [`GasEscrow.sol`](../contracts/execution/GasEscrow.sol), [`GasRefundVault.sol`](../contracts/relayer/GasRefundVault.sol) | `createExecution`, `retryExecution`, `failExecution`, gas refund |
| EVM lock / release | [`BridgeGateway.sol`](../contracts/bridge/BridgeGateway.sol), [`BridgeWrappedToken.sol`](../contracts/tokens/BridgeWrappedToken.sol), [`VaultHealthEvaluator.sol`](../contracts/vault/VaultHealthEvaluator.sol) | `deposit`, `mint`, `burnFrom`, `evaluate` |
| Soroban escrow ledger | [`escrow_accounting.rs`](../contracts/soroban/vault/src/escrow_accounting.rs), [`queries.rs`](../contracts/soroban/vault/src/queries.rs), [`bridge_vault`](../contracts/soroban/bridge_vault/src/lib.rs) | `record_deposit`, `record_release`, `assert_tracked_lte_actual` |
| Message types | `deposit`, `retry`, `refund`, `recovery` (see [`types.rs`](../contracts/soroban/bridge_endpoint/src/types.rs) and [SIGNATURE_SPECIFICATION.md](./SIGNATURE_SPECIFICATION.md)) | observe → finalize → deliver / refund / recover |
| Off-chain checks | [`accounting-invariant-report.service.ts`](../src/reconciliation/accounting-invariant-report.service.ts), [`reserve-reconciliation.service.ts`](../src/reconciliation/reserves/reserve-reconciliation.service.ts), [`state_verifier.ts`](../apps/cli/src/invariants/state_verifier.ts) | lock/mint, burn/release, solvency reconciliation |

Out of scope: price/oracle correctness, signature cryptography (covered by [SIGNATURE_SPECIFICATION.md](./SIGNATURE_SPECIFICATION.md)) and wrapped-token supply governance beyond the conservation identity in C-9.

## 2. Notation and state model

For a source chain `c`, token `t`, message `m` and actor `a`:

- `A(m)` is the gross amount debited on the source chain; `F(m)` is an explicitly recorded fee with `0 <= F(m) <= A(m)`; `N(m) = A(m) - F(m)` is the amount credited on the destination chain.
- `D(c,t)`, `H(c,t)`, `L(c,t)`, `R(c,t)`, `Fee(c,t)` are cumulative deposited, held, delivered, refunded and collected-fee totals for the `(c,t)` escrow ledger.
- `B(c,t)` is a corroborated on-chain token balance (never a single RPC or relayer assertion).
- `S(m)` is the terminal settlement state of `m`: `pending` (observed, unfinalized), `locked`, `delivered` or `refunded`.
- `Consumed` is the set of message ids that have settled at most once. A message id is globally unique across lanes, not merely per recipient.
- `Nonce(a,c)` is the next expected source nonce for sender `a` on chain `c`; it is derived from accepted messages so a reorg can safely drop an unfinalized observation.
- `next(a,c)` is the per-actor next expected nonce; `now` is monotonic model time derived from finalized chain time, never from a relayer timestamp.

The model is a state machine. A transition either commits all of its ledger, status, nonce and `Consumed` changes, or commits none of them. Failed target calls are rolled back; only a bounded attempt counter may advance so an operator can refund an exhausted message.

| Transition | Preconditions | Effect on success |
| --- | --- | --- |
| `observeDeposit(m)` | caller is the message receiver; lane is supported; message shape and bounds valid; nonce is `next(a,c)`; id unseen; not expired; lane not frozen | create `pending` record; **no** total changes |
| `finalizeDeposit(m, confirmations)` | record is `pending`; `confirmations >= finalityDepth(c)`; observation height <= `now` | `H += A`, `D += A`; status `locked` |
| `deliver(m, proof)` | caller is relayer/receiver; status `locked`; id not in `Consumed`; proof is corroborated; attempts below bound; target accepted | `H -= A`, `L += N`; status `delivered`; add id to `Consumed` |
| `retryDelivery(m, proof)` | same as `deliver`; attempt counter incremented on both success and target revert | on revert: status, totals and `Consumed` unchanged |
| `refund(m)` | caller is governance/guardian; status `locked`; id not in `Consumed` | `H -= A`, `R += A`; status `refunded`; add id to `Consumed` |
| `reorg(c, head, ids)` | caller is governance; ids inside the reorg window; unfinalized ids only | delete `pending` records; finalized ids freeze the lane and require recovery |
| `recover(m, resolution, proof)` | lane frozen; status `locked`; independently verified proof of an unexecuted target | resolve by `deliver` or `refund` through the same accounting path |
| `freeze` / `unfreeze` | caller is governance/guardian; `unfreeze` only when recovery is complete | pause/resume new deposits and deliveries; refunds always stay open |

## 3. Conservation invariants

The model exposes `invariantViolations()`, which evaluates the static invariants after every operation. The test harness additionally snapshots state before every rejected operation and requires it to be byte-for-byte unchanged.

- `C-1` **Local conservation**: for every `(c,t)`, `D(c,t) = H(c,t) + L(c,t) + R(c,t) + Fee(c,t)` after every committed transition. Fees are collected only on delivery; a refund returns the full gross amount and accrues no fee.
- `C-2` **Solvency**: `H(c,t) <= B(c,t)` whenever a corroborated `B(c,t)` exists. A shortfall is never netted against a surplus on another chain or token.
- `C-3` **Single settlement**: a `messageId` enters `Consumed` at most once, and only from `delivered` or `refunded`. Duplicate escrow, duplicate delivery, replay and duplicate refund are rejected without state change.
- `C-4` **Authorization boundary**: only the receiver may observe/finalize deposits; only configured relayers or the receiver may deliver; only governance/guardians may freeze, refund, reorg or recover. Unauthorized calls fail closed.
- `C-5` **Atomicity**: a target revert, failed proof, rejected batch or exhausted retry leaves totals, statuses and `Consumed` unchanged. `simulate(fn)` provides a rollback view for preflight checks and canaries.
- `C-6` **Monotonic accounting**: `D`, `L`, `R` and `Fee` never decrease on a committed path, no total is negative, and `delivered`/`refunded` states are terminal. `H` is the only decreasing total because held funds are converted exactly once into delivery, refund or fees.
- `C-7` **Finality and reorg safety**: unfinalized observations never enter `H` or `D`. A finalized record is never silently deleted or rewritten by a reorg: the lane freezes, `recoveryRequired` is set, and a reviewed recovery is mandatory before resume.
- `C-8` **Bounded work**: message size, batch size, retry count and amount are checked against `ChainProfile` before any per-item work. Oversized input cannot drive unbounded iteration or storage growth.
- `C-9` **Source/destination equality**: for each message, `A(m) = N(m) + F(m)`; source debit equals destination credit plus the explicitly recorded fee. Lock/mint and burn/release reports in [`accounting-invariant-report.service.ts`](../src/reconciliation/accounting-invariant-report.service.ts) must reconcile to the same identity.
- `C-10` **Global conservation**: summing `C-1` over all chains and tokens gives `ΣD = ΣH + ΣL + ΣR + ΣFee`. A shortfall on one chain is an incident, not a balance transfer from another chain.

## 4. Trust assumptions and explicit parameters

- RPC providers, indexers and relayers are untrusted for security-critical inputs. `finalityDepth`, `reorgWindow`, chain ids, escrow addresses, token decimals and bounds come from the versioned table below or the reviewed deployment inventory. `observeActualBalance` and proof validation require **two distinct corroborating sources**; a single observation is rejected.
- The receiver adapter is trusted to observe only real source deposits and to pass the actual transferred amount. The fee is explicit in the message and cannot exceed the debit.
- Governance/guardians are trusted to freeze, refund and recover under the approved runbook. Refunds remain available while frozen so users can always recover funds.
- Tokens are non-rebasing and do not apply a transfer fee. Fee-on-transfer or rebasing tokens require an explicit adapter and a new parameter-set version; otherwise C-1 and C-2 can be violated by the token itself.
- Signing material is isolated through the secret manager ([KEY_MANAGEMENT_RUNBOOK.md](./KEY_MANAGEMENT_RUNBOOK.md)). No production key, RPC credential or relayer-derived security value appears in the model, tests or this document.

### Versioned chain parameters

`parameterSetVersion` MUST be recorded in deployment and incident evidence. Changing any row requires a reviewed change record, a new version, a fresh test run and an updated conformance review.

| Chain | Parameter version | Confirmations | Reorg window | Max message bytes | Max batch | Max attempts | Max amount | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `evm:1` | `escrow-conservation/1.0.0` | 12 | 64 | 4096 | 128 | 3 | 10^30 | `finality-config:1` |
| `evm:137` | `escrow-conservation/1.0.0` | 128 | 256 | 4096 | 128 | 3 | 10^30 | `finality-config:137` |
| `evm:56` | `escrow-conservation/1.0.0` | 15 | 50 | 4096 | 128 | 3 | 10^30 | `deployment-inventory-baseline:56` |
| `evm:42161` | `escrow-conservation/1.0.0` | 1 | 10 | 4096 | 128 | 3 | 10^30 | `finality-config:42161` |
| `evm:10` | `escrow-conservation/1.0.0` | 1 | 10 | 4096 | 128 | 3 | 10^30 | `finality-config:10` |
| `evm:8453` | `escrow-conservation/1.0.0` | 6 | 20 | 4096 | 128 | 3 | 10^30 | `deployment-inventory-baseline:8453` |
| `soroban:stellar` | `escrow-conservation/1.0.0` | 1 | 1 | 2048 | 64 | 3 | 2^63-1 | `finality-policy:stellar` |

Values marked *deployment inventory baseline* are explicit local baselines, not values read from an RPC response. Production MUST reconcile them with the restricted deployment inventory before approving the parameter-set version.

## 5. Partial failure, reorg and retry behavior

- **Destination revert**: the transfer stays `locked`; a retry is allowed up to `maxDeliveryAttempts`. Totals and `Consumed` do not change on a failed attempt. After exhaustion, refund is the only settlement path.
- **Partial fill/refund**: a partial fill is a delivery of `N(m)` with a recorded fee; a partial refund is a refund of the still-locked remainder. Each part uses a unique message id, and the sum of parts must equal `A(m)` for the original deposit.
- **Reorg before finality**: the pending observation is removed; no escrow total, nonce or consumed entry is rewritten.
- **Reorg after finality or ambiguous finality**: freeze, set `recoveryRequired`, and escalate. Do not accelerate settlement on an unfinalized view. Recovery reuses `deliver` or `refund` only with an independently verified proof of an unexecuted target nonce.
- **Partition / stale data**: missing events are `unknown`, not `refunded` or `delivered`. Require a second independent read and finalized state before deciding.
- **Emergency**: freeze is the first mutation. Refunds stay open; retry only with proven unexecuted nonces. Any failed recovery leaves the lane frozen and sets `manual-recovery-required`.

## 6. Conformance of current implementations

The model is normative; the table records how shipped code maps to it. Deviations are tracked, not silently accepted.

| Implementation | Supported invariants | Known deviation / required follow-up |
| --- | --- | --- |
| `FallbackEscrow.sol` | C-1 (balance vs unclaimed entries), C-3 for positive-amount escrow and claims, C-8 indirectly via callers | `claimEscrowedTokens` pays `msg.sender` and does not verify the stored recipient; `claimable` is cumulative and not decremented; a zero-amount id can be re-escrowed because the duplicate check tests `amount > 0`. See [ESCROW_SOLVENCY_INVARIANTS.md](./ESCROW_SOLVENCY_INVARIANTS.md). These require a separately reviewed contract change before C-3/C-4 can be claimed for the claim path. |
| `MessageReceiverCore.sol` | C-5 (destination revert diverts to escrow atomically) | Relies on the configured escrow address and the caller-supplied amount; enforce the reviewed address and amount binding at deployment and in message validation. |
| Soroban `escrow_accounting.rs` | C-1/C-6 for `tracked_balance`, C-2 via `assert_tracked_lte_actual` | Message deduplication is a caller responsibility; the helpers are intentionally non-idempotent. The guarded `lib.rs` entry points MUST be wired behind receiver authorization in the deployment. |
| Off-chain reconciliation services | C-1/C-9/C-10 monitoring | Services use floating-point tolerance in the daily report; they alert, they do not enforce. On-chain invariants remain authoritative. |

### Integration and fork coverage matrix

Local integration evidence deploys real escrow bytecode with synthetic accounts and tokens for every versioned chain profile. Fork/staging evidence is a release gate, not a claim made by this specification: it MUST be attached for each production chain and token before a parameter-set version is approved.

| Chain | Local integration | Fork/staging evidence required before release | Token behavior |
| --- | --- | --- | --- |
| `evm:1` | `BridgeEscrowConservation.integration.test.ts` | Mainnet fork: escrow, duplicate, claim, gas ceiling | Standard ERC-20; fee-on-transfer/rebasing tokens need a new adapter and version |
| `evm:137` | same suite, 128-confirmation profile | Polygon fork: deep-reorg containment, refund sweep | Standard ERC-20 |
| `evm:56` | same suite, 15-confirmation baseline | BSC fork: finality baseline reconciliation | Standard ERC-20 |
| `evm:42161` | same suite, 1-confirmation profile | Arbitrum fork: fast-finality and retry path | Standard ERC-20 |
| `evm:10` | same suite, 1-confirmation profile | Optimism fork: fast-finality and retry path | Standard ERC-20 |
| `evm:8453` | same suite, 6-confirmation baseline | Base fork: finality baseline reconciliation | Standard ERC-20 |
| `soroban:stellar` | Model profile and Rust `escrow_accounting` invariant tests | Stellar testnet/staging: ledger finality, `tracked <= actual`, authorization | Native/Soroban token with 7 decimals; non-rebasing |

## 7. Migration, monitoring and operator recovery

- This specification changes no bytecode and requires no migration. A future contract change that closes the deviations in section 6 is security-critical and requires a new deployment, a reviewed migration, an updated parameter-set version and independent audit evidence.
- Alert on any `invariantViolations()` entry, shortfall in `B(c,t)`, replay rejection spike, `recoveryRequired`, frozen lanes, or a reorg crossing the configured window. Reconcile event-derived state with corroborated on-chain reads and keep a reorg-aware cursor.
- Operators freeze first, list locked transfers, settle via refund unless an unexecuted nonce is independently proven, and record the accounting snapshot in the restricted incident record. Follow [VALIDATOR_QUORUM_LOSS_RECOVERY_RUNBOOK.md](./VALIDATOR_QUORUM_LOSS_RECOVERY_RUNBOOK.md), [EMERGENCY_LIQUIDITY_PROCEDURES.md](./EMERGENCY_LIQUIDITY_PROCEDURES.md) and [UPGRADE_ROLLBACK_RUNBOOK.md](./UPGRADE_ROLLBACK_RUNBOOK.md).
- Monitor resource usage against the bounds in section 4; reject oversized batches and messages before iteration. Worst-case cost is `O(maxTransfersPerBatch)` per batch and `O(1)` per single message transition.

## 8. Verification evidence

Reproduce the evidence locally (no production keys or RPC required):

```sh
pnpm exec jest --runInBand --runTestsByPath scripts/bridge-escrow-conservation.spec.ts
pnpm exec hardhat --config scripts/hardhat.escrow-conservation.config.ts test test/execution/BridgeEscrowConservation.integration.test.ts
pnpm exec hardhat --config scripts/hardhat.escrow-conservation.config.ts test test/execution/FallbackEscrow.invariants.test.ts
cargo test --manifest-path contracts/soroban/vault/Cargo.toml
```

The Soroban Rust target currently fails to compile in this checkout because the root lockfile resolves `ed25519-dalek` 3.0.0 against `soroban-env-host` 22.1.3. That is a pre-existing dependency conflict, unrelated to this specification and outside its change scope; attach a passing Rust run from a reconciled toolchain to the release record.

The scoped config at [`scripts/hardhat.escrow-conservation.config.ts`](../scripts/hardhat.escrow-conservation.config.ts) compiles only the escrow contracts and their local mocks. The root config compiles every contract in the repository, and unrelated legacy upgradeable contracts currently mix OpenZeppelin v4 initializer names with the declared v5 dependency; the scoped config avoids that pre-existing failure without changing production code or dependencies.

The Jest suite covers valid, invalid, boundary and adversarial inputs, seeded stateful fuzz interleavings, replay/unauthorized rejection, conservation across success/revert/retry/refund/recovery, per-chain profiles, and resource bounds. The Hardhat suite deploys the real EVM escrow for every supported chain profile with local, synthetic tokens and accounts. Soroban ledger invariants are covered by the Rust test target and by the conformance mapping in section 6. Link the CI run, fuzz seed/output, fork or staging evidence for each production chain and token, threat-model/change record and independent audit evidence in the release record. Passing local tests alone do not authorize production changes.

## 9. Dependencies

[ESCROW_SOLVENCY_INVARIANTS.md](./ESCROW_SOLVENCY_INVARIANTS.md), [CONTRACT_UPGRADES_AND_ACCOUNTING.md](./CONTRACT_UPGRADES_AND_ACCOUNTING.md), [SIGNATURE_SPECIFICATION.md](./SIGNATURE_SPECIFICATION.md), [CROSS_CHAIN_MESSAGE_VALIDATION.md](./CROSS_CHAIN_MESSAGE_VALIDATION.md), [VALIDATOR_QUORUM_LOSS_RECOVERY_RUNBOOK.md](./VALIDATOR_QUORUM_LOSS_RECOVERY_RUNBOOK.md), [RELEASE_COMPATIBILITY_GATE.md](./RELEASE_COMPATIBILITY_GATE.md).
