# Contract Upgrade and Rollback Runbook

This runbook covers a UUPS implementation upgrade of an upgradeable bridge contract such as `BridgeCoreUpgradeable`, and its rollback. The steps below are mirrored one-to-one by the executable definition `UPGRADE_RUNBOOK` in `scripts/upgrade-rollback-runbook.ts`. A test fails if a step id is missing from this document or if the definition breaks a safety rule, so keep both in sync.

Directly deployed contracts have no proxy upgrade path; for those, follow the [deployment rollback decision tree](./DEPLOYMENT_ROLLBACK_DECISION_TREE.md) and plan a migration. See also [CONTRACT_UPGRADES_AND_ACCOUNTING.md](./CONTRACT_UPGRADES_AND_ACCOUNTING.md) and the [mainnet change approval checklist](./MAINNET_CHANGE_APPROVAL_CHECKLIST.md).

## Roles and trust

- **operator** runs checks and snapshots. **owner** is the governed multisig/timelock that owns the proxy and is the only party that can pause and upgrade. **approver** is independent: never the operator or owner, and performs no mutation.
- The implementation address, its commit and compiler settings, and the chain parameters come from the reviewed change record, never from RPC or relayer data.

## Upgrade steps

1. `verify-provenance`: the new implementation's [provenance record](./DEPLOYMENT_PROVENANCE.md) verifies against the reviewed build.
2. `verify-storage-layout`: the layout is append-only relative to the current implementation, and the candidate differs from the current one. Re-running the runbook after a successful upgrade aborts here with no change.
3. `snapshot-state`: record the current implementation, pause state and a state snapshot (transfer records and totals). Accounting invariants must already hold.
4. `approve-upgrade`: the independent approver signs off.
5. `pause-bridge`: pause new deposits and executions. Refunds stay available so users can always recover funds.
6. `upgrade-implementation`: owner upgrades the proxy. Requires approval and a paused bridge.
7. `verify-post-upgrade`: implementation matches, prior state is preserved (nothing lost, rewritten or un-settled), invariants hold.
8. `unpause-bridge`: resume only after verification, and only if the bridge was live before the change.
9. `observe-window`: watch invariants through the agreed window. A breach triggers rollback.

## Rollback steps

Any failure after the first mutation runs these in order. Each is idempotent and safe to retry:

1. `ensure-paused`: pause the bridge if it is not paused.
2. `rollback-implementation`: restore the implementation recorded in the snapshot (not "the previous one", so a re-run cannot downgrade a good upgrade).
3. `verify-post-rollback`: implementation equals the snapshot, prior state is preserved, invariants hold.
4. `reconcile-in-flight`: list locked transfers and decide retry or refund for each; do not replay ambiguous submissions.
5. `resume-bridge`: resume only if verification passed and the bridge was live before the change.

If a rollback step itself fails, the outcome is `manual-recovery-required`: the bridge is left paused, and the owner and incident commander follow the decision tree. A failure before any mutation is `aborted` and changes nothing.

## Accounting invariants

Checked after every step, and by the tests across success, revert, retry, refund and recovery:

- Conservation: deposited = escrow held + delivered + refunded.
- Escrow held equals the sum of locked transfers; delivered equals executed transfers; refunded equals refunded transfers.
- A transfer settles at most once; a destination revert changes nothing and may be retried; replays are rejected.
- Upgrade and rollback never lose or rewrite a transfer record or reduce a total.

## Monitoring and recovery

Alert on pause, upgrade and role events from the proxy, on any invariant breach, and on `manual-recovery-required`. Rehearse the runbook on a fork or staging chain before each production upgrade. For a reorg around the upgrade transaction, re-run `verify-post-upgrade` at the confirmation depth in the change record before `unpause-bridge`.
