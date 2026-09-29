# Service objectives and critical incident response

These are BridgeWise's initial internal service level objectives (SLOs) for
mainnet API operations. They are operational targets, not a customer-facing
service guarantee. Review them after the first 30 days of production telemetry
and quarterly thereafter.

## Objectives

| Service indicator | Objective                                                                       | Window          |
| ----------------- | ------------------------------------------------------------------------------- | --------------- |
| API availability  | At least **99.9%** of eligible requests complete successfully                   | Rolling 30 days |
| Quote latency     | **95th percentile at or below 1,500 ms** for successful `POST /quotes` requests | Rolling 30 days |

The availability error budget is **0.1% of eligible requests**. At a steady
request rate this is equivalent to about 43.2 minutes in a 30-day month, but
the service objective is request based.

Count 2xx and 3xx responses as successful. Count timeouts, 429 rate limits, and
5xx responses as failed. Exclude other 4xx responses because they indicate
invalid client input. Measure quote latency end to end from API receipt to
response, using successful quote responses only. Use a minimum of 100 samples
before declaring a window compliant or breached; smaller windows are
`insufficient-data` and should rely on synthetic probes.

The executable policy and pure evaluator are in
`src/monitoring/slo/service-objectives.ts`. The evaluator takes request
observations from the host telemetry system; it does not persist data or make
network probes itself.

## Alert thresholds

### Critical page (SEV-1)

Page the on-call responder when any of these is true:

- At least 100 eligible requests occurred in five minutes and availability is
  below **99%**.
- At least 100 successful quote requests occurred in five minutes and quote
  p95 latency is above **3,000 ms**.
- Independent synthetic probes from two regions fail three consecutive times.
- A confirmed security event, loss of signing/key control, or risk of
  unauthorized or duplicate transaction execution is detected.

The first two request-based conditions are exposed by
`evaluateCriticalIncident`. Synthetic probe and security alerts must be wired
by the deployment monitoring and security systems.

### Warning (SEV-2)

Open an incident ticket and notify the service owner if availability is below
99.9% for 15 minutes, quote p95 exceeds 1,500 ms for 15 minutes, or the
rolling error budget is projected to be exhausted before the end of the
window. Escalate to SEV-1 if the critical page conditions are met or customer
impact is increasing.

## Response procedure

1. **Acknowledge within five minutes.** Record the start time, affected
   endpoints/chains, observed availability and latency, request volume, and
   alert source. Do not include credentials, signing material, wallet
   addresses, or customer payloads in incident notes.
2. **Assign roles.** The first responder acts as incident commander until
   another owner takes over. Assign an operator to inspect telemetry and a
   communications owner for status updates.
3. **Confirm scope.** Compare API-level errors with regional probes and
   upstream provider health. Separate 4xx client errors from 429, timeout, and
   5xx failures. Check recent deployments and configuration changes.
4. **Mitigate before root cause analysis.** Roll back a recent bad release;
   route around an unhealthy bridge/provider; enable safe fallback behavior;
   or temporarily shed non-critical work. Disable an affected write path if
   transaction safety or signing integrity is uncertain. Do not retry an
   operation unless idempotency/duplicate-submission protections are known to
   apply.
5. **Communicate every 15 minutes** while SEV-1 impact continues. State
   customer impact, mitigations, and the next update time; do not speculate
   about a root cause.
6. **Recover and verify.** Keep mitigation in place until probes recover and
   availability and quote latency remain below critical thresholds for 15
   consecutive minutes. Confirm transaction state and reconcile any
   uncertain submissions before restoring writes.
7. **Close and learn.** Record the timeline, impact, triggering signals,
   mitigation, and follow-up owners. Complete a blameless review within five
   business days and add actions for missing telemetry, alert gaps, or unsafe
   retry behavior.

## Operational and security notes

- Feed request observations to the evaluator from an API gateway, middleware,
  or metrics backend. Use bounded labels such as endpoint, status class,
  region, and provider; never use wallet addresses, transaction IDs, or raw
  customer data as metric labels.
- The existing Stellar SLA monitor measures provider probes. It is useful for
  upstream diagnosis, but it is not a substitute for API request SLO
  telemetry.
- Store alert history and incident notes in the deployment's approved
  monitoring/incident system. Restrict access to production telemetry and
  follow existing secret-handling and key-compromise procedures.
- Test alert routing with synthetic events before mainnet launch. Ensure there
  is a named on-call rotation, backup contact, and a working way to disable
  risky write operations.

## Verification

```bash
pnpm exec jest src/monitoring/slo/service-objectives.spec.ts --runInBand
```
