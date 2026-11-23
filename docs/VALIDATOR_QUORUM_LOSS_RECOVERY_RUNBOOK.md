# Validator quorum loss and recovery runbook

This runbook covers loss of signing quorum on a BridgeWise bridge lane: ready validators fall below `activeThreshold`, so cross-chain messages can no longer be attested and executed. It is written for production operators and must be executed under the restricted change record for the incident. The steps below are mirrored one-to-one by the executable definition `QUORUM_RUNBOOK` in [`scripts/validator-quorum-runbook.ts`](../scripts/validator-quorum-runbook.ts); a test fails if a step id is missing from this document or if the definition breaks a safety rule, so keep both in sync.

The model and its tests ([`scripts/validator-quorum-runbook.spec.ts`](../scripts/validator-quorum-runbook.spec.ts)) are operational evidence, **not** a substitute for an independent contract audit or for the threat-model review required when a trust boundary changes.

## Scope and affected state

| Area | Affected component / state transition |
| --- | --- |
| Validator set | [`ValidatorSetManager`](../contracts/validator/ValidatorSetManager.sol): `activeValidators`, `activeThreshold`, `pendingValidators`, `pendingThreshold`, `pendingActiveAt`, `EPOCH_DELAY`, `OVERLAP_WINDOW`, `ValidatorSetProposed`, `ValidatorSetActivated`. A set becomes active only after the epoch delay; the outgoing set may contribute during the bounded overlap window, but bundles must never mix sets. Caveat: `isValidator` currently checks only the active set and the manager stores no outgoing set, so overlap behavior must be proven in the consuming verifier on a fork; never assume the manager enforces it. |
| Verification | EVM message verifiers in [`contracts/verifiers/`](../contracts/verifiers/) and [`contracts/core/`](../contracts/core/), replay protection in [`TransientReplayGuard.sol`](../contracts/security/TransientReplayGuard.sol), and Soroban verifiers in [`contracts/soroban/`](../contracts/soroban/). Signature/domain rules are normative in [SIGNATURE_SPECIFICATION.md](./SIGNATURE_SPECIFICATION.md). |
| Relayer / signing fleet | `apps/relayer-service` intake, `MessageQueue`, and the per-chain signer availability probes in [`SignerAvailabilityReadinessService`](../src/operations/mainnet/signer-availability-readiness.service.ts). Submission paths fail closed when readiness is not `ready`. |
| Message types | EIP-712 `BridgeMessage` attestations and any Soroban-equivalent attestation for deposit, execution, retry and refund messages. Shape-only validation in [CROSS_CHAIN_MESSAGE_VALIDATION.md](./CROSS_CHAIN_MESSAGE_VALIDATION.md) does **not** prove quorum. |
| Chains | Every configured directed lane. Apply the runbook per affected lane; a healthy lane is unaffected. Chain IDs, bridge addresses and confirmation depths come from the chain registry and the deployment inventory, never from RPC or relayer data. |
| Transfer state | `locked → executed` or `locked → refunded`. A destination revert leaves a transfer `locked` and may be retried; a settled transfer never settles twice. Freezing blocks new deposits and executions, but refunds stay open so users can always recover funds. |

## Roles, authorization and trust assumptions

- **operator** performs reads, probes and evidence capture. **owner** is the governed multisig/timelock holding the pause authority and the `PROPOSER_ROLE` used by `proposeValidatorSet` / `activateValidatorSet`. **approver** is independent: never the operator or owner, and performs no mutation. Only the owner may freeze/unfreeze or change the validator set; only the owner/operator may settle locked transfers. The runbook fails closed if any of these boundaries are crossed.
- Security-critical parameters are explicit and versioned in the restricted deployment inventory and approved change record: chain IDs and lanes, verifier/bridge addresses, domain name/version, validator set and threshold, `EPOCH_DELAY`, `OVERLAP_WINDOW`, confirmation depth and observation window. Record the parameter-set version in the incident record. Never infer these values from an RPC response, relayer message, cached state or an operator's memory.
- RPC providers, indexers, relayers and signer probes are untrusted: they may be stale, partitioned or adversarial. Corroborate quorum loss with at least two independent observations and finalized chain state before declaring an incident.
- Keys are provisioned through the secret manager under [KEY_MANAGEMENT_RUNBOOK.md](./KEY_MANAGEMENT_RUNBOOK.md). Never place signing material, private RPC credentials or unrestricted event details in this document, logs, metric labels or the incident record.
- A reorg, a delayed finality window or a stale probe is a reason to freeze and re-verify, not to accelerate activation or resume early.

## Invariants (checked after every step)

- Conservation: `deposited = escrow held + delivered + refunded`.
- Escrow held equals the sum of `locked` transfers; `delivered` equals executed transfers; `refunded` equals refunded transfers.
- A transfer settles at most once. A destination revert changes nothing and can be retried; a replayed message id or nonce is rejected.
- Buffers are sorted and unique: duplicate or unordered signer bundles revert, and a bundle belongs to exactly one validator set. Ready signers in that set must meet its threshold.
- Domain binding holds: source/target chain IDs, bridge address and signature version match the deployment; deadlines and persistent replay/nonce state are enforced.
- Freezing is the first mutation; submissions resume only after the reviewed set is active and a canary has passed. If any later step fails, the lane stays frozen. Rotation and recovery never delete or rewrite a transfer record or reduce a total.

## Procedure

### Detect (read only)

1. `confirm-quorum-loss`: confirm the incident from at least two independent observations — for example, an on-chain read of the active validator set and threshold, plus a signer availability report. Verify that ready signers are actually below the active threshold; do not act on a single alert or an unfinalized event.
2. `snapshot-validator-state`: capture the chain and lane, active set, threshold, pending proposal, `EPOCH_DELAY`, `OVERLAP_WINDOW`, pause state and a full transfer snapshot. Check the accounting invariants before any mutation and store the snapshot in the restricted incident record.
3. `classify-loss-cause`: classify the cause as `signer-outage`, `key-compromise`, `set-error`, `rpc-or-reorg`, or `unknown`, with supporting evidence. An unknown cause is handled as the most conservative case: keep the lane frozen through a full reviewed rotation.

### Contain

4. `freeze-submissions`: the owner freezes new deposits and executions on the affected lanes. Refunds remain available. This is the first permitted mutation and the fail-safe reference point for every later step.
5. `list-locked-transfers`: list every locked transfer with lane, amount, nonce and the preliminary retry-or-refund decision. Retry only messages whose nonce and executed-set status are independently proven unexecuted; otherwise refund.

### Approve

6. `approve-recovery-plan`: an independent approver records sign-off on the reviewed validator set, threshold, timings and recovery plan. The approver is neither operator nor owner and performs no mutation. Approval must precede any restoring mutation; emergency freezing does not wait for it. Use [MAINNET_CHANGE_APPROVAL_CHECKLIST.md](./MAINNET_CHANGE_APPROVAL_CHECKLIST.md) and [MULTISIG_PROPOSAL_MONITORING.md](./MULTISIG_PROPOSAL_MONITORING.md).

### Restore

7. `verify-reviewed-parameters`: re-check the reviewed set, threshold, epoch delay and overlap window against the approved change record and the versioned deployment inventory, and confirm the timing values still match the deployed contract. Reject any value supplied only by a relayer or RPC read.
8. `propose-validator-set`: the owner calls `proposeValidatorSet` with the reviewed set and threshold. Record `ValidatorSetProposed`, its set contents and the resulting `pendingActiveAt`. Never propose a set inferred from an untrusted source.
9. `provision-signer-keys`: distribute replacement signing material through the secret manager and mark only the reviewed signers available. Verify availability with an independent probe; do not log key material or reuse keys from a compromised signer.
10. `wait-epoch-delay`: wait until finalized chain time reaches `pendingActiveAt`. Do not substitute wall-clock time, probe time or a relayer's view. A reorg that moves the proposal transaction back must restart this step.
11. `activate-validator-set`: the owner calls `activateValidatorSet`, then records `ValidatorSetActivated`, the active set and the new threshold. Do not bypass the timelock; if the reviewed set is wrong, freeze and start a new reviewed proposal rather than reverting in place.

### Verify and observe

12. `verify-quorum-restored`: confirm the active set and threshold match the review, ready signers meet the threshold, no proposal is pending, and accounting invariants still hold. Ensure verifiers still require sorted, distinct, single-set signatures and persistent replay/nonce checks. Confirm each verifier's `sortedValidators` / `threshold` inputs are pinned to the reviewed values rather than accepted from caller-supplied calldata; treat untrusted wiring as a blocking finding. Cross-check with [POST_DEPLOYMENT_ADDRESS_CHECK.md](./POST_DEPLOYMENT_ADDRESS_CHECK.md) before resuming.
13. `canary-probe`: dry-run a unique canary message under the restored set. Prove domain, deadline, ordering, distinctness and quorum acceptance, then prove that a replay of the same message is rejected. The probe must leave state unchanged: no consumed nonce, no locked transfer and no changed total.
14. `resume-submissions`: resume new deposits and executions only after the canary passes. A lane that was already frozen before the incident stays frozen until separately cleared; record that decision.
15. `observe-window`: monitor signer availability, verifier rejections, replay alerts, pause events, accounting invariants and chain finality through the agreed confirmation window. Any breach restarts containment at step 4.

### Fail-safe and recovery

Any failure after `freeze-submissions` runs the following stage immediately. Each step is idempotent and safe to retry:

16. `ensure-frozen`: keep the affected lanes frozen. Never resume while a set change is unverified or recovery is unproven.
17. `settle-locked-transfers`: refund locked transfers; retry only transfers with independently proven unexecuted nonces. Do not replay an ambiguous submission. Escrow must equal the remaining locked transfers.
18. `record-recovery-evidence`: record step outcomes, event references, finalized block numbers, signer-probe results, accounting snapshot and the escalation decision in the restricted incident record.

If a fail-safe step fails, the outcome is `manual-recovery-required`: the lane is left frozen and the incident commander escalates through [PRODUCTION_SUPPORT_ESCALATION_MATRIX.md](./PRODUCTION_SUPPORT_ESCALATION_MATRIX.md) and [DEPLOYMENT_ROLLBACK_DECISION_TREE.md](./DEPLOYMENT_ROLLBACK_DECISION_TREE.md). Recovery may be re-run with the recorded snapshot. A failure before the first mutation is `aborted` and changes nothing.

## Partial failure, reorg and retry behavior

- **Partial signer outage:** if ready signers still meet the threshold, do not rotate; alert, raise probe coverage and continue observing. If they do not, freeze and follow the full procedure.
- **Compromised signer:** freeze, revoke the credential at its issuer per the key runbook, and rotate to a fully reviewed set. Signatures from the compromised set are never mixed with the new set to reach quorum.
- **RPC/indexer partition or reorg:** treat missing events as unknown, not as proof. Use a second independent read path, wait for the configured confirmation depth, and re-run `snapshot-validator-state` and `verify-quorum-restored` before resuming. If a proposal or activation was reorged out, restart from `propose-validator-set`.
- **Destination revert:** the transfer stays `locked`; retry with fresh validation or refund. Reverted execution never changes totals.
- **Duplicate/replayed message:** reject without mutation. Both the persistent executed set and the per-sender nonce must be intact after every path.

## Resource bounds

The validator set and signature bundle are bounded (`MAX_VALIDATORS = 64`, `MAX_BUNDLE_SIZE = 64`). Bundles are checked for size before their entries are read, so oversized hostile input cannot cause unbounded work; strict ascending order makes duplicate detection linear. Signer probes have a bounded per-signer timeout (see `SignerAvailabilityReadinessService`), and message ids and payloads are bounded by the relayer's validation limits. Tests cover the maximum-size bundle and a hostile oversized input that must be rejected before any indexed access.

## Migration, monitoring and deployment implications

- This runbook is operational guidance; it does not change contract bytecode. A change to validator set management, thresholds, signature domain or replay protection is a security-critical contract change requiring a reviewed upgrade/migration per [CONTRACT_UPGRADES_AND_ACCOUNTING.md](./CONTRACT_UPGRADES_AND_ACCOUNTING.md) and [UPGRADE_ROLLBACK_RUNBOOK.md](./UPGRADE_ROLLBACK_RUNBOOK.md), plus a new threat-model review and independent audit evidence.
- Updates to validator addresses or thresholds are on-chain state transitions under `PROPOSER_ROLE` and the epoch timelock; record the post-rotation set in the deployment inventory and update probes, alert routing and contact directories before the old signers are retired.
- Alert on signer readiness below threshold, freeze/unfreeze events, `ValidatorSetProposed` / `ValidatorSetActivated`, verifier rejection spikes, replay attempts, accounting breaches, stale RPC data and `manual-recovery-required`. Reconcile event-derived state with contract reads and keep a reorg-aware cursor, as described in [MULTISIG_PROPOSAL_MONITORING.md](./MULTISIG_PROPOSAL_MONITORING.md).
- Rehearse the full procedure on a fork or staging chain for each supported chain before mainnet use, including timelock expiry, overlap expiry, reorg and fail-safe retry. Measure worst-case probe and verification latency against the deployment's freshness SLO.

## Verification evidence

- Executable definition: [`scripts/validator-quorum-runbook.ts`](../scripts/validator-quorum-runbook.ts).
- Unit, boundary, adversarial, fault-injection and seeded interleaving tests: [`scripts/validator-quorum-runbook.spec.ts`](../scripts/validator-quorum-runbook.spec.ts).
- Reproduce locally: `npx jest scripts/validator-quorum-runbook.spec.ts --runInBand`. CI must run the same spec and the reproducible build/artifact checks in [RELEASE_COMPATIBILITY_GATE.md](./RELEASE_COMPATIBILITY_GATE.md) and [DEPLOYMENT_PROVENANCE.md](./DEPLOYMENT_PROVENANCE.md).
- Link the CI run, fuzz/benchmark output, fork or staging run for each affected chain, threat-model update and independent audit evidence in the approved change record. Passing tests alone do not authorize a production rotation.

## Dependencies

[SIGNATURE_SPECIFICATION.md](./SIGNATURE_SPECIFICATION.md), [POST_DEPLOYMENT_ADDRESS_CHECK.md](./POST_DEPLOYMENT_ADDRESS_CHECK.md), [KEY_MANAGEMENT_RUNBOOK.md](./KEY_MANAGEMENT_RUNBOOK.md), [MAINNET_CHANGE_APPROVAL_CHECKLIST.md](./MAINNET_CHANGE_APPROVAL_CHECKLIST.md), [PRODUCTION_SUPPORT_ESCALATION_MATRIX.md](./PRODUCTION_SUPPORT_ESCALATION_MATRIX.md), [EMERGENCY_LIQUIDITY_PROCEDURES.md](./EMERGENCY_LIQUIDITY_PROCEDURES.md), [DEPLOYMENT_ROLLBACK_DECISION_TREE.md](./DEPLOYMENT_ROLLBACK_DECISION_TREE.md), [CANARY_ROLLOUT_RUNBOOK.md](./CANARY_ROLLOUT_RUNBOOK.md), [RELAYER/retry procedures](../README.md), and the chain-specific deployment inventory maintained outside this repository.
