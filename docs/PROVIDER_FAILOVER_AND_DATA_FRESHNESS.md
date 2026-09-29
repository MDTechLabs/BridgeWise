# Provider failover and data freshness

## RPC failover

Use `StellarBridgeFailoverProvider.execute` for provider RPC operations. Pass
providers in priority order (lower priority number first). The service records
consecutive failures per provider, opens its circuit after three failures, and
allows one trial request after the 30-second cooldown. Both thresholds and the
clock are configurable. The operation timeout defaults to five seconds.

Automatic failover is permitted only for operations explicitly marked
`idempotent: true`. Do not mark transaction submission, signing, or any
operation with ambiguous side effects as idempotent: a lost response does not
prove the provider failed to apply the request. Idempotent callbacks receive an
`AbortSignal`; pass it to the HTTP/RPC transport so a timed-out attempt stops
consuming resources. The service aborts and advances on timeout, but cannot
guarantee cancellation if a transport ignores the signal.

```ts
const result = await failover.execute(
  (provider, { signal }) => rpcRead(provider.url, request, { signal }),
  { idempotent: true },
);
```

`getCircuitStatuses()` provides bounded operational state by provider name,
failure count, and retry time. Do not use endpoint URLs, credentials, or request
data as metric labels. `recover(providerName)` is an operator override and
should only be used after independently confirming provider health.

## Quote and liquidity freshness

Quote comparison drops expired quotes (including quotes expiring at the current
time) and quotes older than 60 seconds by default. Set `maxQuoteAgeMs` to the
route's reviewed freshness budget. Quotes dated in the future or with invalid
timestamps are excluded. Quotes without `expiresAt` still require a fresh
`quotedAt`; callers must additionally validate expiry before signing.

Liquidity snapshots are accepted only when their provider-reported timestamp
is no more than 60 seconds old and is not in the future. Override
`maxSnapshotAgeMs` globally or per provider where the source has a documented
refresh cadence. Cache TTL controls cache reuse separately. When a refresh
fails, expired cached liquidity is omitted rather than returned as current
routing data; alert on empty provider results and refresh/revalidate before
execution.

## Operational checks

- Keep idempotency explicit at each RPC call site; do not blanket-retry writes.
- Set freshness windows no wider than the data source and execution workflow
  can safely tolerate.
- Alert on sustained provider failures, open circuits, no eligible quote, or
  no fresh liquidity result. Inspect circuit status and verify endpoints before
  applying a manual recovery.
- Exercise primary success, secondary failover, open-circuit bypass, cooldown
  recovery, expired quotes, stale/future timestamps, and stale-liquidity
  rejection in CI before deployment.