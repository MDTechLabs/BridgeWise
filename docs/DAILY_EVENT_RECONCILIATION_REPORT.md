# Daily Contract Event vs Database Reconciliation Report

Status: normative reference specification for daily reconciliation reporting (issue #1528).
Version: `daily-reconciliation/1.0.0`.
Executable model: [`scripts/daily-event-reconciliation-report.ts`](../scripts/daily-event-reconciliation-report.ts).
Executable evidence: [`scripts/daily-event-reconciliation-report.spec.ts`](../scripts/daily-event-reconciliation-report.spec.ts).
Related controls: [PRODUCTION_CONFIGURATION_BUNDLE.md](./PRODUCTION_CONFIGURATION_BUNDLE.md), [BRIDGE_ESCROW_CONSERVATION_SPEC.md](./BRIDGE_ESCROW_CONSERVATION_SPEC.md), [MESSAGE_STATUS_RECONCILIATION.md](./MESSAGE_STATUS_RECONCILIATION.md).

This model produces one deterministic, integrity-checked report per UTC day comparing **contract events** with **database transfer records**. It is a detection control, not a self-healing job: it never mutates transfers, accounts or chain state. It complements the reserve and accounting-invariant reports already in `src/reconciliation/`.

## 1. Scope, affected components and state transitions

| Area | Component / state | Relevant transitions |
| --- | --- | --- |
| Report model | `DailyReconciliationService`, `ReconciliationInput`, `DailyReconciliationReport` | validate feeds → classify → hash → retain |
| Event source | EVM/Soroban contract logs, indexer output (untrusted) | pinned head → finality filter → match |
| Database source | transfer records from the API/relayer store (untrusted) | match by `chainId + transferId` |
| Configuration | explicit `CONFIG_CHAIN_PROFILES` (`production-config/1.0.0`), optional active config digest | finality depth, chain coverage, version binding |
| Downstream | operator alerting, incident evidence export, accounting reports | alert on `fail` status; archive report |
| Chains | `evm:1`, `evm:10`, `evm:56`, `evm:137`, `evm:8453`, `evm:42161`, `soroban:stellar` | one explicit pinned head per configured chain |

Event types compared: `deposit`, `delivery`, `refund`; states: `confirmed`, `reverted`. Amounts are integer minor units with no floating-point conversion.

## 2. Trust assumptions and authorization boundaries

- Event feeds, indexers, relayers and database rows are untrusted inputs. The report accepts only explicitly supplied pinned heads and the reviewed `finalityDepth` from the versioned profile table. A chain with a missing or malformed head fails the whole report (`incomplete-feed`); an empty but explicitly pinned feed is allowed and recorded as zero counts.
- The model never calls an RPC endpoint and never infers chain parameters from feed data. Partial network unavailability therefore produces a fail-closed error, never a misleading `pass`.
- Reports are append-only per UTC day. A second report for the same day is rejected, so a replayed or duplicated job cannot overwrite a protected report.
- The optional `configDigest` binds the report to the active signed [production configuration bundle](./PRODUCTION_CONFIGURATION_BUNDLE.md); operators must verify it matches the release record before relying on a report.
- A chain reorganization that removes an event after a report is generated requires a new incident record; the retained report's integrity hash is never rewritten.

## 3. Matching rules and report integrity

Input validity is checked before any classification: UTC day, exactly one pinned head per configured chain, bounded event/record arrays, explicit token, amount, state, type, block, log index and transaction hash. Invalid shapes are rejected atomically.

For each chain, finalized events (depth `head - blockNumber + 1 >= finalityDepth`) are matched to database records by `chainId + transferId`. Differences in amount, status, token or type are emitted as separate sorted discrepancies. Database rows with no event, events with no database row, duplicate keys and unfinalized events are also discrepancies. No discrepancy can be silently dropped; if the list exceeds the configured bound the report fails with `too-many-discrepancies` rather than truncating.

`reportId` is `sha256(canonicalJson({domain: 'bridgewise-daily-event-reconciliation-v1', day, generatedAt, heads, events, records, configDigest}))`. `integrityHash` is the hash of the canonical full report. `verifyDailyReport()` recomputes it, checks that `status === 'pass'` only when there are zero discrepancies, and verifies the chain coverage and report id shape.

## 4. Invariants

- `R-1` **Deterministic integrity**: identical reviewed inputs yield an identical report id and hash; any modification to inputs or report is detectable.
- `R-2` **Complete chain coverage**: every configured chain has an explicit pinned head; missing feeds fail closed.
- `R-3` **Exact comparison**: amounts compare as integer strings and statuses/tokens/types compare exactly; no float or locale-dependent coercion.
- `R-4` **Finality and reorg safety**: unfinalized events are reported as discrepancies, never treated as matched or silently ignored.
- `R-5` **Bounded work**: at most 512 feed rows and 128 discrepancies by default; oversized inputs or discrepancy sets are rejected without unbounded iteration.
- `R-6` **No replay mutation**: one report per UTC day; rejected or duplicate jobs leave state byte-for-byte unchanged.
- `R-7` **Status correctness**: `pass` iff zero discrepancies and full chain coverage; `fail` otherwise.
- `R-8` **Explicit inputs**: all security-critical values come from reviewed configuration or the request; nothing is read from RPC or relayer data.

Stable error codes: `invalid-profiles`, `invalid-bounds`, `invalid-time`, `clock-must-not-go-backwards`, `invalid-config-digest`, `invalid-input`, `invalid-day`, `incomplete-feed`, `invalid-heads`, `input-too-large`, `invalid-event`, `invalid-record`, `too-many-discrepancies`, `duplicate-report`, `invalid-report`.

## 5. Migration, monitoring and operator recovery

- **Deploy/upgrade**: off-chain reporting only; no contract migration. Schedule the model with a reviewed head-snapshot job, pin all heads at the same wall-clock checkpoint, and pass the active config digest. Store reports and audit trails in durable, access-controlled storage.
- **Monitoring**: alert on `fail` reports and on every error code, especially `incomplete-feed` and `too-many-discrepancies`. Track report age per chain, discrepancy counts by code, and digest mismatch against the release record.
- **Emergency recovery**: fix the feed or database divergence, then generate a *corrected* report for a new day or a versioned follow-up record; never rewrite the retained report. A failed or replayed job retains nothing, so re-running after remediation is safe.
- **Partial failure / reorg**: absence of a chain head blocks the report. A reorg that changes finalized events must be handled through the incident/recovery runbook and produce a new report; pinned heads make the original result reproducible.

## 6. Verification evidence

- Unit, boundary, adversarial and seeded stateful-fuzz coverage: `scripts/daily-event-reconciliation-report.spec.ts`.
- Supported-chain integration evidence: `test/execution/OperationalSafety.integration.test.ts`.
- CI wiring: `.github/workflows/ci.yml`. No production key or live RPC is used; independent review is required before the report is used as a financial-control record.
