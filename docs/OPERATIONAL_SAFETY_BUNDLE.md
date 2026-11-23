# Operational Safety Configuration Bundle

Status: reviewed production bundle index for the Operational Safety and Treasury workstream (issues #1526-#1529).
Version: `production-config/1.0.0`.
Scope: off-chain conformance models, verification evidence and operational controls. No production contract bytecode is changed by this bundle.

This document ties four independently testable controls into one release record. Every control is explicit, versioned, auditable and fail-closed under adversarial or partially unavailable network conditions. Passing tests are **not** a substitute for an independent contract audit.

| Issue | Control | Normative document | Model / evidence |
| --- | --- | --- | --- |
| #1526 | Signed and reviewed production configuration bundle | [PRODUCTION_CONFIGURATION_BUNDLE.md](./PRODUCTION_CONFIGURATION_BUNDLE.md) | `scripts/production-config-bundle.ts`, `.spec.ts` |
| #1527 | Signed incident evidence export for affected transfer identifiers | [INCIDENT_EVIDENCE_EXPORT_CROSS_CHAIN.md](./INCIDENT_EVIDENCE_EXPORT_CROSS_CHAIN.md) | `scripts/incident-evidence-export.ts`, `.spec.ts` |
| #1528 | Daily contract event vs database reconciliation report | [DAILY_EVENT_RECONCILIATION_REPORT.md](./DAILY_EVENT_RECONCILIATION_REPORT.md) | `scripts/daily-event-reconciliation-report.ts`, `.spec.ts` |
| #1529 | Delayed relayer recovery without duplicate destination execution | [DELAYED_RELAYER_RECOVERY.md](./DELAYED_RELAYER_RECOVERY.md) | `scripts/delayed-relayer-recovery.ts`, `.spec.ts` |

Shared integration evidence: [`test/execution/OperationalSafety.integration.test.ts`](../test/execution/OperationalSafety.integration.test.ts) with the scoped Hardhat config [`scripts/hardhat.escrow-conservation.config.ts`](../scripts/hardhat.escrow-conservation.config.ts).

## 1. Affected components and trust boundaries

- **Contracts / adapters**: [`FallbackEscrow.sol`](../contracts/execution/FallbackEscrow.sol), [`MessageReceiverCore.sol`](../contracts/execution/MessageReceiverCore.sol), [`TransientReplayGuard.sol`](../contracts/security/TransientReplayGuard.sol), EVM nonce registries and the Soroban escrow ledger. These are exercised in integration but not modified.
- **Message types**: `deposit`, `retry`, `refund`, `recovery` across the seven supported chains listed in the configuration bundle.
- **State transitions**: configuration assemble → approve → activate → verify; evidence request → approve → validate → audit → retain; reconciliation validate → classify → hash → retain; relay observe → submit → probe / markLost → recover.
- **Untrusted inputs**: RPC responses, indexers, relayers, event feeds and database rows. None supplies a security-critical value. Reviewers, guardians and operators are explicit authorized roles; signing material is isolated in KMS/HSM for production and generated locally and discarded in tests.
- **Partial failure / reorg**: absence of corroborated data fails closed. Unfinalized observations may be dropped only inside the chain's reorg window; finalized observations freeze the lane and require the reviewed recovery path. No model silently rewrites retained evidence, reports or accounting.

## 2. Invariants and acceptance mapping

| Acceptance criterion | Evidence |
| --- | --- |
| Unit tests for valid, invalid, boundary and adversarial inputs | Four `.spec.ts` suites, including exact-key validation, bad signatures, malformed feeds and boundary values |
| Stateful fuzz / invariant tests | Seeded multi-step sequences in all four suites (deterministic LCG, no external entropy) |
| Unauthorized callers and replayed messages cannot mutate protected state | Atomic-rejection helpers compare full snapshots; replay, duplicate ids and stale releases are rejected |
| Accounting invariants across success, revert, retry, refund and recovery | `D = H + L + R + Fees` in the relayer model, single-settlement in the config/escrow evidence, integrity hashes for exports and reports |
| Fork / integration tests per supported chain and token behavior | Nine Hardhat cases: one per chain profile plus a 16-item worst-case batch, using ERC-20 mocks and real escrow bytecode |
| Gas / resource bounds measured | Per-chain escrow and claim `gasUsed` ceilings (<300k / <500k), explicit chain and feed bounds in every model |
| Deployment, upgrade, emergency recovery documented | Section 5/6 of each control document and the existing runbooks linked from each |
| Reproducible build artifacts / verified bytecode | Reviewed `sourceCommit`, canonical JSON digests, `scripts/deployment-provenance.ts`, `scripts/verify-bytecode.ts`, scoped deterministic Hardhat build |

## 3. Deployment and operations

1. Run deployment preflight, deploy/upgrade contracts, record provenance and verify deployed addresses using the existing scripts and [MAINNET_CHANGE_APPROVAL_CHECKLIST.md](./MAINNET_CHANGE_APPROVAL_CHECKLIST.md).
2. Assemble a *new* `parameterSetVersion` containing real inventory addresses and the reviewed finality/reorg values; placeholder addresses in `CONFIG_CHAIN_PROFILES` are documentation baselines only.
3. Collect distinct reviewer approvals from isolated signing infrastructure, activate with an authorized operator, and record the digest, release sequence and receipt in the release evidence.
4. Wire each consumer to `verifyActive()` on startup and on a schedule. Export evidence, reconciliation and relayer recovery all refuse to run without an active verified bundle.
5. Monitor expired bundles, failed verification, uncorroborated probes/feeds, duplicate execution alerts and discrepancy spikes. On incident, freeze affected lanes, follow the relevant runbook, and activate a corrected bundle with a higher sequence.

## 4. Verification evidence and limitations

Run locally:

```
pnpm exec jest --runInBand --runTestsByPath scripts/production-config-bundle.spec.ts scripts/incident-evidence-export.spec.ts scripts/daily-event-reconciliation-report.spec.ts scripts/delayed-relayer-recovery.spec.ts
pnpm exec hardhat --config scripts/hardhat.escrow-conservation.config.ts test test/execution/OperationalSafety.integration.test.ts
```

CI runs both commands as separate steps in `.github/workflows/ci.yml`. The models are deterministic and use no production key, live RPC or relayer feed. Threat-model review is recorded in each control document; independent audit evidence for any security-critical on-chain change must be attached to the release record before production activation.
