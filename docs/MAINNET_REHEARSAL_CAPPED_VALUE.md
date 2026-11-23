# End-to-end mainnet rehearsal with capped-value transactions

## Objective
Run a controlled mainnet rehearsal validating the full bridge lifecycle with strict value caps before broad release.

## Preconditions
- Approved change record and named sign-offs.
- Verified deployed bytecode/config (see deployment provenance checks).
- Monitoring/alerting active; rollback owner on-call.
- Test wallets funded from isolated operational wallets; no production user funds.

## Capped-value policy
- Per-tx cap: configured low value (e.g. <= $10 equivalent).
- Per-chain daily rehearsal cap.
- Allowlisted tokens/chains only.
- Automatic halt if cap exceeded or anomaly detected.

## Rehearsal steps
1. Confirm chain configs, RPC quorum, and finality policy versions.
2. Execute deposit -> attest/relay -> execute -> verify balances on each supported lane.
3. Execute failure-path case: delayed inclusion/congested RPC and confirm safe retry/refund behavior.
4. Execute emergency pause drill during rehearsal window.
5. Verify accounting invariants and event reconciliation.
6. Record tx hashes, block numbers, timings, gas/resource usage, and operator observations.

## Exit criteria
- All capped-value happy-path transactions succeed on each supported chain.
- Failure paths fail closed with no accounting drift.
- Pause/unpause and alerts behave as expected.
- Evidence package attached to release record.

## Evidence
- Tx hashes, chain IDs, block numbers, finalized status.
- Screenshots/log excerpts (redacted).
- Invariant check output and sign-off.
