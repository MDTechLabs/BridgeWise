# Canary rollout runbook

The relayer package exports `CanaryRolloutRouter` for selecting between a stable and candidate execution handler. It defaults to zero canary traffic. Assignment is deterministic by message ID, so retries remain in the same cohort. The router reports path, outcome, and duration without transaction IDs or payloads. Connect `onOutcome` and `onRollback` to the approved monitoring and alerting system.

## Operational limits

- Router configuration and counters are in process memory. A rollback call affects that router instance only. The operator control plane must fan out the kill switch to every relayer replica and set the upstream traffic weight to zero.
- This repository does not define a hosting platform, ingress, or authenticated rollout-control endpoint. Do not expose `setTrafficPercent` or `rollback` through a public endpoint. Wire them only to the approved authenticated deployment/control plane.
- The candidate path is never retried through the stable path after a failure. A failed on-chain submission may already have side effects; replaying it automatically could duplicate an execution.
- The router provides in-process outcome counters and callback hooks, not a durable metrics backend. The deployment must export and alert on these signals before production rollout.

## Before rollout

1. Build and test the candidate; run it in staging against representative traffic and verify execution, confirmation, replay protection, and recovery behavior.
2. Configure a rollback policy. Defaults automatically disable the candidate when its rolling failure rate reaches 10% after 20 canary samples, over a window of up to 100 samples. Tune from baseline data before production use; do not lower the sample floor without review.
3. Connect outcome callbacks to metrics and alerts. Track stable and canary attempts, successes, failures, latency, queue depth, confirmation time, duplicate execution signals, and chain/provider health. Keep labels bounded to execution path and outcome; do not label metrics by message, wallet, recipient, or transaction ID.
4. Confirm the authorized operator can set traffic to zero in every replica and the ingress can route 0% to the candidate. Record the stable release, candidate release, thresholds, approver, and rollback procedure.

## Progressive exposure

Start with `trafficPercent: 0` and `enabled: false`. Increase through 1%, 5%, 10%, 25%, 50%, then 100%, holding each step for at least 15 minutes and 50 completed executions when volume allows. Do not advance when volume is too low to assess reliability. Compare canary results against the stable cohort and the pre-release baseline at every step.

Pause or roll back immediately for any incorrect balance, duplicate execution, unauthorized action, lost transaction, safety-check bypass, or sustained chain/provider incident. Also roll back if the canary failure rate reaches the configured threshold, or if p95 latency is more than 20% above stable for five minutes. These operational thresholds are starting guidance; set them against the service's measured SLOs before rollout.

## Immediate rollback

1. Invoke `router.rollback('operator')` through the authenticated control plane on every relayer replica. The router immediately routes subsequent messages to the stable handler and emits a rollback event.
2. Set the hosting traffic router's candidate weight to 0 and stop sending new work to candidate-only instances. This is required because the in-process kill switch is not shared across replicas.
3. Keep the candidate release available for investigation, but do not retry already submitted or ambiguous on-chain work on the stable path. Reconcile message IDs and transaction hashes through the normal idempotent recovery process.
4. Confirm canary attempts stop increasing, stable execution health returns to baseline, and pending messages drain. Preserve aggregate metrics and sanitized logs for incident review.
5. Re-enable only after the cause is understood, the fix is reviewed, staging passes, and the rollout approver authorizes a new canary window.

## Control API example

The router is library-level and must be composed by the relayer's execution dispatcher:

```typescript
const router = new CanaryRolloutRouter(
  (message) => stableExecutor.execute(message),
  (message) => candidateExecutor.execute(message),
  {
    enabled: false,
    trafficPercent: 0,
    onOutcome: (metric) => metrics.recordExecutionOutcome(metric),
    onRollback: (event) => alerts.notifyCanaryRollback(event.reason),
  },
);

// Only through an authenticated operator control plane:
router.setTrafficPercent(5);
router.rollback('operator');
```

The example sends only bounded aggregate fields to monitoring. Never log message contents, recipient details, or transaction payloads from rollout callbacks.
