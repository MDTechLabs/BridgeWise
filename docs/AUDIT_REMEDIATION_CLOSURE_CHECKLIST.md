# Audit Remediation Closure Checklist

Independent closure gate for contract audit findings. Implementation: `scripts/audit-remediation-closure.ts`. An audit is closed only when every finding is remediated, independently verified, and the fixes are in the commit being deployed.

## Lifecycle

`open` -> `remediated` -> `verified` -> audit `closed`. A failed verification returns the finding to `open`, clears the remediation evidence and increments its attempt counter. `closed` is terminal.

## Independence rules (enforced in code)

- Remediators, verifiers and closers are disjoint reviewed principal sets. Overlap fails at construction (`NOT_INDEPENDENT`).
- The remediator of a finding cannot verify it.
- A closer cannot be a remediator.
- Verification of a fix must name the exact commit that was remediated (`COMMIT_MISMATCH` otherwise).
- Critical and high findings must be fixed; they cannot be closed through risk acceptance. Medium and below may be accepted with a risk-acceptance reference, which a verifier must still confirm.
- A fix needs a full commit id and at least one regression test reference.

## Closure conditions

1. Every finding is `verified`; `checklist()` lists remaining blockers by finding id.
2. For each `fixed` finding, the trusted local `isAncestor(fixCommit, deployedCommit)` predicate (for example `git merge-base --is-ancestor`) is true. A throwing predicate counts as false. Do not source this from RPC or relayer data.
3. The closer is authorized and independent.

## Safety properties

Unauthorized actors, replayed transitions, unknown findings and invalid input are rejected with a typed `ClosureError` and leave state and the event log unchanged. The event log is sequential and records accepted actions only. Closing twice, or acting after closure, fails with `ALREADY_CLOSED`.

## Operations

- Create the finding list from the signed audit report and the principal sets from the reviewed change record; do not edit them mid-closure.
- Attach the `checklist()` output and `events()` log to the mainnet change approval record (see [MAINNET_CHANGE_APPROVAL_CHECKLIST.md](./MAINNET_CHANGE_APPROVAL_CHECKLIST.md)). Pair it with the [deployment provenance record](./DEPLOYMENT_PROVENANCE.md) so the deployed commit is the same one checked at closure.
- Checklist state is in memory. Persist the event log with the release evidence and rebuild by replaying it if the process is lost; if the log is unavailable, treat the audit as not closed.
- A finding discovered after closure is a new finding in a new checklist; do not reopen a closed one.
