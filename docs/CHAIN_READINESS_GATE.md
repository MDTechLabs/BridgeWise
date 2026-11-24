# Chain readiness gate for halt and restart scenarios

Normative reference for `scripts/chain-readiness-gate.ts` (issue #1522).
The parameter set is `readiness/1.0.0`; keep the invariant ids, error codes and
bounds in this document in sync with the model — the spec test enforces it.

## Trust boundary

Every security-critical value comes from the checked-in, versioned
`ReadinessPlan`: chain ids, halt/restart semantics, observer and operator
identities, confirmation depth, freshness bound, in-flight bound and restart
epoch. A health feed, RPC endpoint or relayer is only an **untrusted
observation** that is compared against the plan. The model never reads a
network, sends a transaction, or uses signing material. Disposable identities
used in tests are never production keys.

Authorization boundaries:

- Only reviewers of the plan may define observers and operators.
- Observers may submit observations but cannot clear a halt or advance an epoch.
- Only an authorized operator may call `halt` or `restart`.
- Duplicate or replayed observations are rejected before they affect state.

## State transitions

```
active --halt(operator)--> halted --restart(operator, quorum)--> restarting --> active
```

A chain is production-ready only when it is `active` and **every** chain in the
plan passes all of: lifecycle, observer quorum, chain-not-halted, reorg depth,
freshness, consistent pin, in-flight bound. Any failed or missing check fails
closed: the aggregate `ready` flag is `false`.

## Reorg and partial failure

All observations must be pinned at a block at least `minConfirmations` behind
their reported head, and all observers must agree on a single pinned block. A
shallow pin, disagreeing pins, a stale observation, a provider error encoded as
a malformed observation, or a missing quorum makes the gate fail closed. An
observation is never used to infer its own security parameters; mismatches are
rejections, not fallbacks.

## Restart safety

`restart` requires a quorum of distinct authorized observers on the **current**
epoch reporting an unhalted chain, a reorg-safe pinned block, and in-flight
messages within the reviewed bound. It then advances the restart epoch
monotonically, which invalidates all older observations. Epoch regression is
rejected. This gives an auditable, replay-resistant record that a halt was
cleared only after a verified restart.

## Invariants

- `R-1` — a halted observation at the current epoch is reported as unsafe.
- `R-2` — fewer than `minObservers` distinct authorized observers is a quorum shortfall.
- `R-3` — a halted or restarting chain keeps production gated.
- `R-4` — restart epochs are monotonic; regression is impossible.
- `R-5` — accepted observations are unique; replays are rejected.
- `R-6` — unauthorized callers cannot mutate lifecycle or epoch state.
- `R-7` — an observation pinned inside the confirmation window is unsafe.
- `R-8` — chain, observer and observation counts are bounded (`MAX_READINESS_CHAINS`,
  `MAX_READINESS_OBSERVERS`, `MAX_READINESS_OBSERVATIONS`, `MAX_IN_FLIGHT_MESSAGES`),
  so worst-case work is constant per chain and unbounded loops are avoided.

## Deployment, upgrade and recovery

- Activation requires a versioned `releaseId` and exact parameter-set match;
  upgrading the gate means publishing a new parameter set, not mutating live state.
- An emergency halt must be executed on-chain through the existing kill-switch
  path; this model gates *readiness* and does not replace the on-chain action.
- Recovery requires the operator restart flow plus a fresh quorum. Preserve
  the evaluation report and epoch receipts as incident evidence.
- Monitoring should alert on `invariantViolations()` and on any transition to
  `halted`/`restarting` within the authenticated control plane only.

Release evidence: `scripts/chain-readiness-gate.spec.ts` and the multi-chain
integration suite under `test/execution/`.
