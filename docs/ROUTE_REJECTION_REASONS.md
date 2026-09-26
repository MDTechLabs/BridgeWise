# Route rejection reasons

The Stellar route decision engine returns rejected candidates in
`StellarDecisionResult.rejections`. Each rejection now includes a stable
machine-readable `code`, a backward-compatible `reason` summary, and a
`reasons` array containing every applicable explanation.

## Example

```ts
const decision = engine.decide(candidates, context, { policy });

for (const rejection of decision.rejections) {
  console.info('Route rejected', {
    routeId: rejection.route.id,
    code: rejection.code,
    reasons: rejection.reasons.map(({ code }) => code),
  });
}
```

The first reason is also exposed as `reason` and `code` for consumers that
need one summary. Existing consumers that read `route` and `reason` continue to
work. New consumers should branch on the stable code instead of parsing the
human-readable message.

## Rejection codes

| Code | Meaning |
| --- | --- |
| `INVALID_SLIPPAGE` | Candidate slippage is negative or not finite. |
| `INVALID_ESTIMATED_TIME` | Candidate estimated time is negative or not finite. |
| `INVALID_SUCCESS_RATE` | Candidate success rate is outside `[0, 1]` or not finite. |
| `INVALID_RISK_SCORE` | A supplied risk score is outside `[0, 1]` or not finite. |
| `SLIPPAGE_EXCEEDED` | Candidate slippage exceeds the configured maximum. |
| `ESTIMATED_TIME_EXCEEDED` | Candidate time exceeds the configured maximum. |
| `SUCCESS_RATE_TOO_LOW` | Candidate success rate is below the configured minimum. |
| `PROVIDER_EXCLUDED` | Provider appears in `excludeProviders`. |
| `RISK_LIMIT_EXCEEDED` | Risk signal exceeds the configured risk ceiling. |
| `PROVIDER_INCOMPATIBLE` | Compatibility signal marks the provider incompatible. |

Boundary values equal to the policy threshold are accepted. Optional slippage
is validated only when supplied. Invalid compared metrics reject the candidate
instead of allowing `NaN` or out-of-range values to bypass a policy gate.
Reasons are returned in deterministic order: slippage, time, success rate,
provider policy, risk signal, then compatibility signal.

## Dependencies and operations

The decision engine consumes `BridgeRoute` candidates from the route-ranker
contract and optional risk and compatibility signals supplied by upstream
scoring/compatibility components. Downstream APIs, UIs, and analytics consuming
`StellarDecisionResult` can use the stable codes for localized messages,
filtering, or aggregate metrics. Existing free-form `reason` consumers remain
compatible.

The decision engine is a pure library and does not emit logs or metrics itself.
Callers that record rejection metrics should aggregate by `code` and avoid
logging the full route payload, wallet address, or other request data.

## Troubleshooting

- `INVALID_*`: correct candidate data at the upstream adapter; do not relax a
  policy threshold to hide malformed data.
- `*_EXCEEDED` or `SUCCESS_RATE_TOO_LOW`: review the active policy and route
  estimate; threshold equality is accepted.
- `PROVIDER_EXCLUDED`: check the caller's `excludeProviders` policy.
- `RISK_LIMIT_EXCEEDED`: review the risk signal and configured risk ceiling.
- `PROVIDER_INCOMPATIBLE`: check the compatibility signal and its missing
  feature list.

Run the focused decision engine tests with:

```bash
pnpm exec jest src/routing/decision-engine/stellar/stellar-route-decision-engine.spec.ts --runInBand
```
