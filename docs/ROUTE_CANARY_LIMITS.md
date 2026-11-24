# Route canary limits

Normative reference for `scripts/route-canary-limits.ts` (issue #1523).
The parameter set is `canary/1.0.0`; the spec test enforces that every invariant
id and the parameter set stay documented here.

## Trust boundary

Route ids, assets, source/destination chains, per-transfer and per-window caps,
minimum and actual window lengths, and operators are checked in and versioned
in a `CanaryPlan`. A relayer may submit message id, route id, amount and
observation time; all of these are validated and bounded here. No value is
inferred from an RPC or relayer response, and amounts are integer minor units
so no floating-point rounding can weaken a cap.

Authorization boundaries:

- Only an authorized operator may `activate`, `promote` or `rollback` a route.
- A relayer may only submit transfers into a `canary` route.
- Message ids are globally unique and idempotent: a replay returns `duplicate`
  and never changes a counter.
- Rejected transfers (cap, stale, malformed, wrong status) do not mutate state.

## Limits and windows

Time is divided into deterministic windows of `windowMs` for each route. A
window is rejected if it is shorter than the reviewed `minWindowMs`. Each
window enforces both `maxTransfersPerWindow` and
`maxNotionalMinorUnitsPerWindow`; each transfer also enforces
`maxTransferMinorUnits`. A newly enabled route starts `new`, moves to `canary`
on activation, and can only be `promoted` after a full window has elapsed with
no cap violation. Any time a route is unsafe, an operator can `rollback` it.

Only the most recent `MAX_TRACKED_WINDOWS` buckets are retained, so storage and
per-transfer work are bounded regardless of route age. There is no unbounded
iteration over history.

## Invariants

- `C-1` — a transfer above the per-transfer cap is rejected.
- `C-2` — cumulative window notional never exceeds its reviewed cap.
- `C-3` — cumulative window transfer count never exceeds its reviewed cap.
- `C-4` — only active canary routes accept transfers; rolled-back routes stay closed.
- `C-5` — duplicate/replayed message ids are idempotent and cannot mutate state.
- `C-6` — unauthorized callers cannot activate, promote or roll back a route.
- `C-7` — route, bucket and processed-message counts are bounded; old windows are pruned.
- `C-8` — promotion requires an elapsed window with no cap violation.

## Deployment, upgrade and recovery

- Enabling a new route always starts in canary with zero traffic; promotion is
  an explicit, authorized, audited transition.
- Tightening a limit requires a new versioned parameter set (`releaseId`), not
  a silent mutation of a live route.
- Rollback closes the route immediately; ambiguous in-flight transfers must be
  reconciled through the existing idempotent recovery process rather than
  auto-retried through the stable path.
- Monitoring should export bounded aggregate counters (accept/reject/replay by
  reason) and alert on cap rejections. Never label metrics by message id,
  wallet or recipient.

Release evidence: `scripts/route-canary-limits.spec.ts` and the multi-chain
integration suite under `test/execution/`.
