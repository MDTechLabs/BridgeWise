# Delayed Relayer Recovery Without Duplicate Destination Execution

Status: normative reference specification for delayed relayer recovery (issue #1529).
Version: `relayer-recovery/1.0.0`.
Executable model: [`scripts/delayed-relayer-recovery.ts`](../scripts/delayed-relayer-recovery.ts).
Executable evidence: [`scripts/delayed-relayer-recovery.spec.ts`](../scripts/delayed-relayer-recovery.spec.ts) and [`test/execution/OperationalSafety.integration.test.ts`](../test/execution/OperationalSafety.integration.test.ts).
Related controls: [PRODUCTION_CONFIGURATION_BUNDLE.md](./PRODUCTION_CONFIGURATION_BUNDLE.md), [BRIDGE_ESCROW_CONSERVATION_SPEC.md](./BRIDGE_ESCROW_CONSERVATION_SPEC.md), [MESSAGE_STATUS_RECONCILIATION.md](./MESSAGE_STATUS_RECONCILIATION.md), [FALLBACK_BRIDGE_ROUTING.md](./FALLBACK_BRIDGE_ROUTING.md).

This model specifies how BridgeWise recovers when a relayer is delayed, loses a submission or reports conflicting outcomes. The relayer is untrusted: destination execution is accepted only from corroborated, finalized observations, and a message id can be consumed on a destination chain **at most once**. The model does not replace the relayer service or the on-chain replay guards; it is executable conformance evidence and must be reviewed alongside an independent contract audit.

## 1. Scope, affected components and state transitions

| Area | Component / state | Relevant transitions |
| --- | --- | --- |
| Recovery model | `DelayedRelayerRecovery`, `MessagePhase`, `RelaySnapshot` | observe → submit → probe / markLost → recover |
| Relayer service | [`duplicate-message-detector.ts`](../apps/relayer-service/src/dedup/duplicate-message-detector.ts), [`nonce-manager.ts`](../apps/relayer-service/src/nonce/nonce-manager.ts), [`message-status-reconciler.ts`](../apps/relayer-service/src/reconciler/message-status-reconciler.ts) | dedupe, pinned nonce, first-outcome-wins reconciliation |
| On-chain guards | [`TransientReplayGuard.sol`](../contracts/security/TransientReplayGuard.sol), [`PackedNonceRegistry`](../test/bridge/PackedNonceRegistry.test.ts), [`FallbackEscrow.sol`](../contracts/execution/FallbackEscrow.sol) | idempotent message id, nonce bitmap, single claim |
| Message types | `deposit`, `retry`, `refund`, `recovery` | observe → submit → deliver / refund / recovery |
| Chains | `evm:1`, `evm:10`, `evm:56`, `evm:137`, `evm:8453`, `evm:42161`, `soroban:stellar` | explicit finality depth and reorg window per chain |
| Downstream | daily reconciliation report, incident evidence export, escrow conservation | alert on `duplicate-destination-execution` or accounting breach |

No operation in this model moves funds. It defines the authoritative state machine that implementations must conform to.

## 2. Trust assumptions and authorization boundaries

- Relayers are untrusted for outcomes. A `probe` is accepted only with at least two distinct corroborating sources and confirmations at least equal to the target chain's `finalityDepth` from the signed configuration. A relayer's claim of "not executed" cannot trigger a refund; guardians require a reviewed, corroborated proof.
- Relayers may observe and submit; guardians (a separate set) may mark loss, recover, freeze/unfreeze and process reorgs. There is no actor overlap.
- Source nonce is pinned at first observation and reused on every retry. A duplicate message id or duplicate fingerprint (same lane, token, amount, nonce and parties) is rejected without state change.
- Chain reorganization is explicit: only unfinalized (`observed`) messages may be dropped, inside the chain's reorg window. If any named message has progressed, the reorg is rejected and governance must freeze the lane and use the reviewed recovery runbook.
- All parameters (finality depths, reorg windows, amount and retry bounds) come from the versioned `production-config/1.0.0` table. No RPC or relayer response supplies a security-critical value, and no production key is used in tests.

## 3. State machine and accounting

| Transition | Preconditions | Effect on success |
| --- | --- | --- |
| `observe(m)` | authorized relayer; supported distinct chains; explicit amount/fee; next nonce; unseen id and fingerprint; lane active | `D += A`, `H += A`; phase `observed`, nonce pinned |
| `submit(id, txHash)` | authorized relayer; phase `observed` or `lost`; attempts below bound; valid tx hash | phase `submitted`; attempts +1; submission time recorded; no total change |
| `probe(id, result)` | authorized caller; corroborated sources; confirmations ≥ target finality; consistent ids/chains | executed: `H -= A`, `L += A-F`, `Fees += F`, id consumed, phase `delivered`; unexecuted or unconfirmed: no change |
| `markLost(id)` | guardian; phase `submitted`; delay elapsed | phase `lost`; no total change |
| `recover(id, resolution, proof)` | guardian; phase `lost`; corroborated finalized proof of *unexecuted* target; id not consumed | `resubmit`: pinned nonce reused, attempts +1; `refund`: `H -= A`, `R += A`, id consumed, phase `refunded` |
| `reorg(chain, ids)` | guardian; ids `observed`, same chain, inside reorg window | remove observations, reverse their `D`/`H`, release fingerprint; progressed ids abort the whole batch |
| `freeze` / `unfreeze` | guardian; supported chain | block/resume new observations and submissions |

`D = H + L + R + Fees` is checked after every committed transition. A delayed or lost relayer can only add attempts and time; it can never add a second credit.

## 4. Invariants

- `D-1` **Conservation**: per chain and token, deposited equals held plus delivered plus refunded plus fees; no total is negative.
- `D-2` **Single destination execution**: a `(targetChain, messageId)` pair enters the consumed set at most once; a second corroborated execution is reported as `duplicate-destination-execution` and does not credit again.
- `D-3` **Pinned nonce and bounded retries**: retries reuse the first pinned nonce; attempts never exceed the configured bound.
- `D-4` **Bounded state**: at most 256 tracked messages, at most 128 ids per reorg batch, and at most one fingerprint per message.
- `D-5` **Atomic rejection**: invalid input, unauthorized caller, bad proof, exhausted attempts or failed reorg leaves the full snapshot unchanged.
- `D-6` **Authorization separation**: only relayers observe/submit; only guardians mark loss, recover, reorg and freeze.
- `D-7` **Corroborated finality**: probes and recovery proofs need at least two independent sources and target/source finality; single-source or unconfirmed outcomes fail closed.
- `D-8` **Reorg safety**: reorgs drop only unfinalized observations; finalized messages require the reviewed recovery path.
- `D-9` **Fail-safe delay**: loss, retry, refund and recovery never duplicate destination execution or blame an uncorroborated relayer report.

Stable error codes: `invalid-profiles`, `invalid-actors`, `invalid-bounds`, `invalid-time`, `clock-must-not-go-backwards`, `invalid-message`, `invalid-message-id`, `unsupported-chain`, `same-chain-lane`, `lane-frozen`, `invalid-token`, `invalid-amount`, `amount-out-of-bounds`, `invalid-nonce`, `invalid-actor-address`, `invalid-observation-time`, `nonce-gap-or-replay`, `duplicate-message-id`, `duplicate-fingerprint`, `invalid-profile-bounds`, `unauthorized-relayer`, `unauthorized-guardian`, `unauthorized-caller`, `invalid-phase-for-submit`, `invalid-phase-for-probe`, `invalid-phase-for-loss`, `invalid-phase-for-recovery`, `attempts-exhausted`, `invalid-tx-hash`, `unknown-message`, `probe-mismatch`, `invalid-probe`, `uncorroborated-probe`, `duplicate-destination-execution`, `delay-not-elapsed`, `invalid-resolution`, `invalid-proof`, `recovery-requires-unexecuted-target`, `invalid-reorg-batch`, `duplicate-reorg-id`, `reorg-chain-mismatch`, `finalized-reorg-requires-recovery`, `outside-reorg-window`.

## 5. Migration, monitoring and operator recovery

- **Deploy/upgrade**: off-chain conformance model only; no contract or bytecode change. Align the relayer service, on-chain nonce/replay guards and this state machine, then attach the integration evidence to the release record.
- **Monitoring**: alert on `duplicate-destination-execution`, `uncorroborated-probe`, `attempts-exhausted`, `outside-reorg-window`, and on any nonzero `invariantViolations()`. Track per-message attempt counts, age of `lost` messages and consumed-key growth.
- **Emergency recovery**: freeze the lane, corroborate target state from at least two independent sources, and either confirm delivery (terminal) or recover by refund/resubmission under guardian approval. Never re-run a consumed message on the destination; publish a new message id if a genuinely new transfer is required.
- **Partial failure / reorg**: a missing or single-source probe is not an outcome. An unfinalized observation may be dropped within the reorg window; a finalized observation freezes the lane and requires the reviewed runbook before resuming.

## 6. Verification evidence

- Unit, boundary, adversarial and seeded stateful-fuzz coverage over randomized observe/submit/probe/recover/reorg sequences: `scripts/delayed-relayer-recovery.spec.ts`.
- Real-EVM supported-chain integration evidence, replay/authorization reverts and worst-case gas measurements: `test/execution/OperationalSafety.integration.test.ts`.
- CI wiring: `.github/workflows/ci.yml`. All keys, accounts and tokens are local test fixtures; no production key, RPC endpoint or relayer credential is used. Independent audit evidence is required for security-critical on-chain changes.
