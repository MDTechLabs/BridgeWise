# Signed and Reviewed Production Configuration Bundle

Status: normative reference specification for the production configuration bundle (issues #1526-#1529).
Version: `production-config/1.0.0`.
Executable model: [`scripts/production-config-bundle.ts`](../scripts/production-config-bundle.ts).
Executable evidence: [`scripts/production-config-bundle.spec.ts`](../scripts/production-config-bundle.spec.ts) and [`test/execution/OperationalSafety.integration.test.ts`](../test/execution/OperationalSafety.integration.test.ts).
Related controls: [OPERATIONAL_SAFETY_BUNDLE.md](./OPERATIONAL_SAFETY_BUNDLE.md), [SIGNATURE_SPECIFICATION.md](./SIGNATURE_SPECIFICATION.md), [KEY_MANAGEMENT_RUNBOOK.md](./KEY_MANAGEMENT_RUNBOOK.md), [MAINNET_CHANGE_APPROVAL_CHECKLIST.md](./MAINNET_CHANGE_APPROVAL_CHECKLIST.md).

This document specifies how a production configuration release is assembled, independently reviewed, cryptographically approved, activated and verified. It is verification evidence and an operational contract, **not** a substitute for an independent audit of the deployed contracts. Activation changes off-chain operational configuration only; it does not upgrade contract bytecode or move funds.

## 1. Scope, affected components and state transitions

| Area | Component / state | Relevant transitions |
| --- | --- | --- |
| Bundled configuration | versioned `CONFIG_CHAIN_PROFILES`, `ProductionConfigBundle`, `ProductionConfigRegistry` | assemble → approve → activate → verify → supersede |
| Reviewer authorization | reviewer public-key registry, `minApprovals` quorum | approve; no private key ever enters the bundle |
| Deployment controls | [`deployment-preflight.ts`](../scripts/deployment-preflight.ts), [`post-deployment-address-check.ts`](../scripts/post-deployment-address-check.ts), [`deployment-provenance.ts`](../scripts/deployment-provenance.ts) | preflight → deploy → provenance → address check → bundle activation |
| Runtime consumers | [`chain-asset-allowlist.service.ts`](../src/config/allowlist/chain-asset-allowlist.service.ts), finality configuration, validator-set version | `verifyActive` gates use of chain parameters |
| Downstream evidence | incident evidence export, daily event-vs-DB reconciliation, delayed relayer recovery | read the active digest and its versioned parameters |
| Chains | `evm:1`, `evm:10`, `evm:56`, `evm:137`, `evm:8453`, `evm:42161`, `soroban:stellar` | one explicit profile per supported chain; no implicit chain |

Message types affected indirectly: `deposit`, `retry`, `refund`, `recovery`. No message is executed by activation; the bundle fixes the finality depths, reorg windows, bridge addresses, validator-set version and per-chain bounds used to judge those messages.

## 2. Trust assumptions and authorization boundaries

- RPC providers, indexers and relayers are **untrusted**. The model performs no network reads. Security-critical values come only from the reviewed, versioned profile table or from a bundle whose digest was approved. A partially unavailable or adversarial RPC/relayer cannot stall or alter approval and activation beyond masking observability; operators must fail closed and wait for corroborated data.
- Reviewers are authorized by public key identifiers derived from `SHA-256(publicKeyPem)`. Each reviewer contributes at most one valid secp256k1 ECDSA/SHA-256 signature over the exact domain-separated digest. Default quorum is 2-of-N with distinct keys. Production signing material stays in KMS/HSM under [KEY_MANAGEMENT_RUNBOOK.md](./KEY_MANAGEMENT_RUNBOOK.md); the test factories create disposable local keys only.
- The operator who activates must be in the reviewed operator set. Review and activation are separate roles, so a compromised operator cannot approve its own configuration without the reviewer quorum.
- Bridges, tokens and validator sets are non-rebasing and pinned by explicit version labels. Fee-on-transfer/rebasing tokens or an unversioned validator set require a new parameter-set version and a fresh review.
- Chain reorganization is handled by the versioned `reorgWindow`: unfinalized observations can be dropped, but a finalized observation is never silently rewritten. Consumers must freeze the affected lane and run the reviewed recovery path before resuming.

## 3. Bundle format and digest binding

`schemaVersion` is 1 and `parameterSetVersion` must equal `production-config/1.0.0`. A bundle contains `releaseId`, strictly increasing `releaseSequence`, a reviewed `sourceCommit`, an explicit `[effectiveFrom, expiresAt)` window (at most 90 days), and an ascending, complete list of chain entries. Chain entries contain `chainId`, `parameterSetVersion`, `finalityDepth`, `reorgWindow`, `bridgeAddress`, `validatorSetVersion`, `minValidatorQuorum`, `maxMessageBytes`, `maxAmountMinorUnits`, `tokenDecimals` and `parameterSource`.

Unknown or missing fields are rejected as `untrusted-field`; this prevents an RPC/relayer payload from smuggling an unaudited value into the digest. The digest is:

```
sha256( canonicalJson({
  domain: 'bridgewise-production-config-bundle-v1',
  schemaVersion, parameterSetVersion, releaseId, releaseSequence,
  sourceCommit, effectiveFrom, expiresAt, chains
}) )
```

`canonicalJson` sorts object keys, serializes integers exactly and forbids floats, so identical reviewed inputs always produce the same digest. Any change to a single character of any field changes the digest and invalidates every approval. Private keys and signature bytes are deliberately excluded from the digest.

## 4. Versioned chain parameters

Every field below is an explicit local baseline; none is inferred from a live RPC response. Addresses are non-production placeholders. A production release MUST publish a new `parameterSetVersion` containing addresses from the restricted deployment inventory and re-run the full approval flow.

| Chain | Parameter version | Finality | Reorg window | Bridge address (baseline) | Validators | Quorum | Max bytes | Max amount (minor units) | Decimals | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `evm:1` | `production-config/1.0.0` | 12 | 64 | `0x1111111111111111111111111111111111111111` | `validator-set/1` | 5 | 4096 | 10^30 | 18 | `finality-config:1` |
| `evm:10` | `production-config/1.0.0` | 1 | 10 | `0x2222222222222222222222222222222222222222` | `validator-set/1` | 5 | 4096 | 10^30 | 18 | `finality-config:10` |
| `evm:56` | `production-config/1.0.0` | 15 | 50 | `0x3333333333333333333333333333333333333333` | `validator-set/1` | 5 | 4096 | 10^30 | 18 | `deployment-inventory-baseline:56` |
| `evm:137` | `production-config/1.0.0` | 128 | 256 | `0x4444444444444444444444444444444444444444` | `validator-set/1` | 5 | 4096 | 10^30 | 18 | `finality-config:137` |
| `evm:8453` | `production-config/1.0.0` | 6 | 20 | `0x5555555555555555555555555555555555555555` | `validator-set/1` | 5 | 4096 | 10^30 | 18 | `deployment-inventory-baseline:8453` |
| `evm:42161` | `production-config/1.0.0` | 1 | 10 | `0x6666666666666666666666666666666666666666` | `validator-set/1` | 5 | 4096 | 10^30 | 18 | `finality-config:42161` |
| `soroban:stellar` | `production-config/1.0.0` | 1 | 1 | `GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF` | `validator-set/1` | 5 | 2048 | 2^63-1 | 7 | `finality-policy:stellar` |

## 5. Invariants

The model exposes `invariantViolations()`. Every rejected call is atomic: the test harness compares a full state snapshot before and after each rejection.

- `B-1` **Digest binding**: the digest commits to every reviewed field; a tampered bundle, reordered chain list or different parameter-set version cannot reuse an approval.
- `B-2` **Distinct reviewed approvals**: only registered reviewer keys verify, one signature per reviewer and digest; the quorum must come from distinct reviewers.
- `B-3` **Activation gate**: activation requires an authorized operator, a quorum on the exact digest, and a current `[effectiveFrom, expiresAt)` window.
- `B-4` **Replay and rollback safety**: a digest activates at most once, and `releaseSequence` must strictly increase; replayed, duplicate or stale releases are rejected.
- `B-5` **Atomic rejection**: invalid input, bad signature, unauthorized caller, missing quorum or failed validation leaves state byte-for-byte unchanged.
- `B-6` **Explicit parameters**: chain ids and all chain values must exactly match the reviewed versioned profile table, with complete chain coverage; unknown chains and extra/untrusted fields fail closed.
- `B-7` **Bounded work**: at most 8 chains, at most one signature per reviewer, and fixed-size fields. Validation and hashing never iterate over caller-controlled unbounded collections.
- `B-8` **Immutable active snapshot**: `verifyActive` revalidates the frozen bundle, its digest, its activation window and its approvals without reading external data; expiry fails closed.
- `B-9` **Isolated signing material**: only public keys and derived reviewer ids are stored; private keys are generated in isolated test processes or KMS/HSM and never logged, serialized into a bundle, or committed.
- `B-10` **Fail-safe partial failure**: no RPC, indexer or relayer input is consulted. Unavailable or adversarial external data cannot mutate approval or activation state.

Stable error codes: `invalid-bundle`, `untrusted-field`, `unsupported-schema`, `unsupported-parameter-set`, `invalid-release`, `invalid-commit`, `invalid-time`, `invalid-validity-window`, `invalid-chains`, `incomplete-chain-coverage`, `unsupported-chain`, `parameter-mismatch`, `invalid-address`, `invalid-profile-bounds`, `invalid-quorum`, `invalid-amount`, `invalid-decimals`, `unauthorized-reviewer`, `invalid-signature`, `duplicate-approval`, `unauthorized-operator`, `quorum-not-met`, `replay`, `not-effective`, `expired`, `stale-release`, `no-active-bundle`, `tampered-bundle`, `invalid-profiles`, `invalid-reviewers`, `invalid-operators`, `invalid-digest`, `invalid-reviewer`, `invalid-input`, `clock-must-not-go-backwards`.

## 6. Migration, monitoring and operator recovery

- **Deploy/upgrade**: run deployment preflight, deploy bytecode, record provenance, verify deployed addresses, then assemble and review a *new* parameter-set version. Activation is the final gate; it never changes bytecode. Superseding a bundle requires a higher `releaseSequence` and a fresh quorum.
- **Monitoring**: alert on `expired` active bundles, failed `verifyActive`, reviewer-set drift, unexpected chain coverage, and any mismatch between the active digest and the digest recorded in the deployment provenance/release record. `verifyActive` is cheap and can run on every consumer start and on a schedule.
- **Emergency recovery**: there is no in-model rollback. Freeze affected lanes using the existing runbooks ([VALIDATOR_QUORUM_LOSS_RECOVERY_RUNBOOK.md](./VALIDATOR_QUORUM_LOSS_RECOVERY_RUNBOOK.md), [DEPLOYMENT_ROLLBACK_DECISION_TREE.md](./DEPLOYMENT_ROLLBACK_DECISION_TREE.md)), activate a corrected bundle with a higher sequence and fresh approvals, then resume. A lost KMS key requires replacing the reviewer set in a new parameter-set version; old approvals are never reused.
- **Partial failure / reorg**: consumers must continue using the last verified active bundle and refuse uncorroborated data. A finalized observation that falls inside a reorg window freezes the lane and requires the reviewed recovery path before the next release is activated.

## 7. Verification evidence

- Unit, boundary, adversarial and seeded stateful-fuzz coverage: `scripts/production-config-bundle.spec.ts`.
- Supported-chain and token integration evidence with real EVM bytecode, replay/authorization reverts and worst-case gas measurements: `test/execution/OperationalSafety.integration.test.ts`, run with `pnpm exec hardhat --config scripts/hardhat.escrow-conservation.config.ts test test/execution/OperationalSafety.integration.test.ts`.
- CI wiring: `.github/workflows/ci.yml`. Build artifacts are reproducible from the reviewed `sourceCommit`; no production key or credential appears in tests or fixtures. Independent audit evidence must be attached to the release record before production activation.
