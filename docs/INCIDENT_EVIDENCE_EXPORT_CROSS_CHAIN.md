# Cross-Chain Incident Evidence Export

Status: normative reference specification for signed incident evidence exports (issue #1527).
Version: `incident-evidence/1.0.0`.
Executable model: [`scripts/incident-evidence-export.ts`](../scripts/incident-evidence-export.ts).
Executable evidence: [`scripts/incident-evidence-export.spec.ts`](../scripts/incident-evidence-export.spec.ts).
Related controls: [INCIDENT_EVIDENCE_EXPORT.md](./INCIDENT_EVIDENCE_EXPORT.md), [PRODUCTION_CONFIGURATION_BUNDLE.md](./PRODUCTION_CONFIGURATION_BUNDLE.md), [KEY_MANAGEMENT_RUNBOOK.md](./KEY_MANAGEMENT_RUNBOOK.md).

This model provides a signed, bounded export for a caller-supplied set of affected **cross-chain transfer identifiers**. It complements the existing Stellar audit-log export in [`audit.service.ts`](../src/audit/transfers/stellar/audit.service.ts); it does not replace or modify that service. The export is verification evidence and must still be stored in encrypted, access-controlled durable storage with a chain-of-custody record. It is not an independent audit.

## 1. Scope, affected components and state transitions

| Area | Component / state | Relevant transitions |
| --- | --- | --- |
| Export model | `IncidentEvidenceExporter`, `EvidenceRequest`, `IncidentEvidenceBundle` | request → approve → validate → audit → retain |
| Authorization | reviewer public keys, `minApprovals` quorum | sign request digest; verify distinct authorized reviewers |
| Configuration binding | active signed bundle from [`production-config-bundle.ts`](../scripts/production-config-bundle.ts) | `verifyActive` gate; record `configDigest` and `parameterSetVersion` |
| Evidence feeds | injected `EvidenceSource`; chain events, indexer, relayer observations (untrusted) | fetch → validate finality/corroboration → redact → hash |
| Downstream | incident response, durable evidence storage, audit sink | verify `integrityHash`, archive bundle and audit event |
| Chains | `evm:1`, `evm:10`, `evm:56`, `evm:137`, `evm:8453`, `evm:42161`, `soroban:stellar` | chain id must exist in the active signed bundle |

Message types whose identifiers may be exported: `deposit`, `retry`, `refund`, `recovery`. No message is executed, refunded or replayed by an export.

## 2. Trust assumptions and authorization boundaries

- The requester identity is authenticated upstream and supplied as a reviewed operator id; it is not client-authoritative. Export requires a quorum of distinct authorized reviewers over the exact request digest, and an active, verified production configuration bundle.
- Chain events, indexers and relayers are untrusted. Evidence is accepted only when it names a chain in the active bundle, is at least `finalityDepth` deep against its own pinned head, and is corroborated by at least two distinct named sources. Security-critical values (chain ids, finality depths, reorg windows) are never inferred from feed data.
- Signing material is isolated under [KEY_MANAGEMENT_RUNBOOK.md](./KEY_MANAGEMENT_RUNBOOK.md); tests use disposable local keys only. No production key or credential is stored in the request, bundle, audit event, fixture or documentation.
- Redaction is disclosure reduction, not anonymization. Fingerprints can be correlated with other data; bundles remain sensitive and must be access-controlled.
- Chain reorganization: evidence inside the reorg window is rejected until it is re-observed at sufficient depth. A downstream reorg that invalidates a retained bundle requires a new incident record referencing the superseding bundle; the original is never silently rewritten.

## 3. Request digest, evidence validation and bundle integrity

The request digest is `sha256(canonicalJson({domain: 'bridgewise-incident-evidence-request-v1', incidentId, requestedBy, startTime, endTime, transferIds: sorted}))`. Reviewers sign that digest with secp256k1 ECDSA/SHA-256 (IEEE-P1363). Changing the incident, window, requester or any transfer id invalidates every approval.

The bundle integrity hash is `sha256(canonicalJson({domain: 'bridgewise-incident-evidence-bundle-v1', all non-hash fields}))`. `bundleId` equals the request digest, so a retained export is uniquely bound to its approved request. `verifyEvidenceBundle()` recomputes the hash, checks the record count, verifies the redaction shape and re-derives `bundleId`; a modified bundle fails verification.

Records are sorted by transfer id. Raw addresses and full transaction hashes are replaced by SHA-256 fingerprints and a 10-character hash prefix. Only token, amount in explicit minor units, status, block, log index and source count remain. A missing, truncated, unfinalized, uncorroborated or malformed record fails the entire export; there is no partial-success bundle. The audit callback runs **before** retention; if it throws, the export is not stored or returned. Repeating an approved request is rejected as `duplicate-export`.

## 4. Invariants

- `E-1` **Request binding**: the digest commits to incident id, requester, window, all transfer ids and the active configuration digest; tampering invalidates signatures and verification.
- `E-2` **Reviewed quorum**: only registered reviewer keys verify, one signature per reviewer, and the configured number of distinct reviewers must approve.
- `E-3` **Complete evidence**: every requested id yields exactly one validated record; missing, duplicate or truncated data fails closed.
- `E-4` **Finality and corroboration**: records below the active chain profile's `finalityDepth`, or with fewer than two independent sources, are rejected.
- `E-5` **Redaction and integrity**: bundles contain no raw addresses or full transaction hashes, and `verifyEvidenceBundle` detects any modification.
- `E-6` **Replay protection**: an approved request produces at most one retained export; replay and duplicate transfer ids are rejected.
- `E-7` **Atomicity and audit-first**: failed validation or a failing audit sink leaves state byte-for-byte unchanged and retains no bundle.
- `E-8` **Bounded work**: at most 64 transfer ids and 128 records, with fixed-size fields; no unbounded iteration over feed data.
- `E-9` **Fail-closed configuration**: without an active, verified signed configuration bundle no evidence can be exported.

Stable error codes: `invalid-config`, `invalid-reviewers`, `invalid-quorum`, `invalid-bounds`, `invalid-time`, `clock-must-not-go-backwards`, `invalid-request`, `invalid-incident`, `invalid-requester`, `invalid-window`, `invalid-transfer-ids`, `duplicate-transfer-id`, `invalid-transfer-id`, `window-not-closed`, `duplicate-export`, `invalid-approvals`, `duplicate-approval`, `invalid-signature`, `quorum-not-met`, `incomplete-evidence`, `input-too-large`, `invalid-record`, `unsupported-chain`, `invalid-tx-hash`, `invalid-token`, `invalid-amount`, `invalid-status`, `insufficient-finality`, `uncorroborated-evidence`, `invalid-bundle`, `audit-sink-failed`.

## 5. Migration, monitoring and operator recovery

- **Deploy/upgrade**: this is an off-chain model and a new documented capability, not a contract upgrade. Wire the exporter into the incident-response service behind authenticated operator endpoints, using KMS/HSM reviewers registered in the production config release. No migration of existing audit data is required.
- **Monitoring**: alert on failed `verifyActive`, `audit-sink-failed`, `incomplete-evidence`, `insufficient-finality` and `uncorroborated-evidence`; these indicate feed degradation or an attempted disclosure. Track exporter version, config digest and export counts.
- **Emergency recovery**: if a bundle or audit event is lost, re-run the approved request once the feed is corroborated again; the previous failed attempt retained nothing, so replay protection does not block recovery. If a signature is suspected compromised, rotate reviewers through a new signed parameter-set version. Never rewrite an archived bundle; publish a superseding export referencing the incident.
- **Partial failure / RPC outage**: with no active verified config or insufficient corroboration the exporter refuses to run. Operators must wait for reviewed data rather than relaxing validation.

## 6. Verification evidence

- Unit, boundary, adversarial and seeded stateful-fuzz coverage: `scripts/incident-evidence-export.spec.ts`.
- Supported-chain integration evidence: `test/execution/OperationalSafety.integration.test.ts`.
- CI wiring: `.github/workflows/ci.yml`. All signing keys in tests are generated locally and discarded; no production key is used. Independent audit/legal review is required before using exports as legal evidence.
