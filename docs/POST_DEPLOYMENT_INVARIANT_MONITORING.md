# Post-deployment invariant monitoring for escrow and supply totals

## Objective
Continuously monitor escrow/supply/accounting invariants after deployment to detect drift, exploits, or operational faults.

## Core invariants
- `total_deposited = escrow_held + delivered + refunded` (per chain/lane/token).
- Escrow balance on-chain >= internal locked obligations.
- Minted/wrapped supply <= locked collateral (where applicable).
- No duplicate settlement/replay for message id/nonce.
- Pause state consistent across control plane and contracts.

## Monitoring design
- Data sources: on-chain logs, contract reads, indexed DB, relayer events.
- Reconciliation cadence: near-real-time for critical invariants; periodic full snapshot.
- Reorg handling: use finalized/safe confirmation threshold before alerting on irreversible breach; mark provisional breaches separately.
- Alerting: severity-based (critical/high/medium), paging for critical invariant breach.

## Response
- Critical breach: auto-pause affected chain/lane if policy allows, page on-call, freeze releases, start incident runbook.
- Record evidence: block range, tx ids, computed totals, config version.

## Verification
- Unit tests for invariant calculators.
- Stateful/fuzz tests for multi-step deposit/execute/refund/retry flows.
- Integration/fork tests per supported chain/token type.
- Alert simulation drill documented before release.
