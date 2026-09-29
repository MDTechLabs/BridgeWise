# Message status reconciliation

The relayer (`apps/relayer-service`) keeps a local view of every message it is delivering. `MessageQueue` tracks each message as `queued` → `processing` → `submitted` → `confirmed`/`failed`. That view is only trustworthy while every component reports back. The `MessageStatusReconciler` periodically compares the tracked status of in-flight messages with the truth on the destination chain and repairs the divergence, so a relayer restart, a hung executor, or a dropped callback cannot leave a message stuck in flight forever.

Reconciliation is the relayer's parsing/validation layer (see [Cross-chain message validation](CROSS_CHAIN_MESSAGE_VALIDATION.md)) extended forward: validation keeps bad messages out at intake, and reconciliation keeps good messages from dying in the middle.

## What gets reconciled

`reconcile()` examines only in-flight messages (`processing` and `submitted`, from `queue.getInflightSnapshot()`). A message younger than `staleAfterMs` is never touched. `queued` and `failed` messages are never touched automatically.

| Tracked state | On-chain truth | Action |
| --- | --- | --- |
| `processing` | unknown (executor never reported) | After `staleAfterMs`, returned to `queued` for another attempt. Once the retry budget is spent it moves to `failed` |
| `submitted` | receipt is final | Completed as `confirmed` with the transaction hash and block |
| `submitted` | receipt shows a revert | Moved straight to `failed` — a revert is treated as deterministic, so retrying would only burn gas |
| `submitted` | no receipt | Left in flight while inside `staleAfterMs`; past the threshold it is returned to `queued` so it can be broadcast again |
| `submitted` | provider unavailable / unknown / error | Left in flight (`deferred`), counted as an error; retried on the next run |

Reconciliation never fabricates a transaction. `confirmed` and `not-found` decisions come only from the configured `MessageStatusProvider` for the message's destination chain; a message with no provider for its chain is always left in flight.

## Ordering and safety

- Reconciliation runs on `queue.complete()` and `queue.fail()`, so its transitions reuse the queue's normal retry/backoff accounting and emit the same lifecycle events a live delivery would.
- A `submitted` message with no destination receipt is only resubmitted once it is past `staleAfterMs`. Configure `staleAfterMs` larger than the destination chain's expected time to finality, and larger than `deduplication.windowMs`, so a receipt that is merely slow is never mistaken for a lost one.
- `processing` staleness is measured from the start of the current delivery attempt (`inflightAt`, set at dequeue), not from the original enqueue, so a normal retry loop is never flagged stale.
- A completion that arrives twice (the live path and the reconciler) is recorded once; the first outcome wins, so a late reconciled result cannot overwrite the real one.

## Events

| Event | Payload |
| --- | --- |
| `message-submitted` (queue) | `{ messageId, txHash, destinationChainId }` |
| `message-reconciled` | `{ messageId, destinationChainId, before, after, action, reason, detail? }` |
| `stale-message-detected` | `{ messageId, status, ageMs, staleAfterMs }` |
| `reconcile-error` | `{ messageId, chainId, error }` |
| `reconciler-degraded` | `{ runId, consecutiveErrorRuns, message }` |
| `reconciler-recovered` | `{ runId }` |
| `reconciliation-summary` | `ReconciliationSummary` with the full `transitions` list |

`message-reconciled` fires only for actual transitions (requeued / confirmed / failed). `no-op` and `deferred` outcomes appear in the summary but are not emitted individually.

## Metrics

`reconciler.getStats()` returns `{ runs, scanned, corrections, requeued, confirmed, failed, deferred, errors, providerUnavailable, consecutiveErrorRuns, lastRunAt, lastRunDurationMs }`.

Operationally:

- A rising `requeued`/`not-found-on-chain` rate usually means the destination RPC is lagging behind the coordinator's estimate of finality — widen `staleAfterMs`.
- `deferred` with `provider-unavailable` means a destination chain has no provider registered; wire one up or accept that messages on that chain are never auto-recovered.
- A climb in `consecutiveErrorRuns` ends in a `reconciler-degraded` alert; alert on it. Runs keep trying, so the first run that makes a correction emits `reconciler-recovered` automatically.

## Configuration

```ts
import {
  MessageQueue,
  MessageStatusReconciler,
  EvmExecutorStatusProvider,
  EvmExecutor,
} from '@bridgewise/relayer-service';

const queue = new MessageQueue({ deduplication: { windowMs: 10 * 60_000 } });

const executor = new EvmExecutor({
  chainId: 'ethereum',
  chainType: 'evm',
  rpcUrl: process.env.ETH_RPC_URL,
  // ...
});

const reconciler = new MessageStatusReconciler({
  queue,
  provider: new EvmExecutorStatusProvider('ethereum', executor), // or an array, one per chain
  config: {
    staleAfterMs: 5 * 60_000, // default: larger than the chain's time to finality
    intervalMs: 60_000,       // default; 0 disables the timer
    reconcileOnStart: true,   // default: run one pass at start()
    maxConsecutiveErrorRuns: 3, // default: alert threshold for the degraded event
  },
});

reconciler.on('message-reconciled', (event) => metrics.observe(event));
reconciler.on('reconciler-degraded', () => pager.ping('reconciliation degraded'));
reconciler.start(); // explicit: reconciliation is opt-in per deployment
```

### Message status provider

A `MessageStatusProvider` is a single function, `getMessageStatus(messageId, txHash)`, returning one of `confirmed` (with an optional block), `reverted` (with an optional error), `not-found`, or `unknown` (with an optional error). The relayer ships `EvmExecutorStatusProvider`, which reuses `EvmExecutor.getTransactionStatus` — the same RPC and confirmation-depth policy as live delivery, so there is exactly one definition of "final" per chain. Soroban and Solana adapters can be built to the same shape.

## Dependencies

- Upstream: none hard; the reconciler talks to the queue it is given.
- Downstream: reconciliation depends on a reachable, honest `MessageStatusProvider` per destination chain. A provider that answers `not-found` too early (before finality) is the main correctness risk — it is why the stale threshold exists.
- `deduplication.windowMs` must exceed `staleAfterMs`: a resubmission after an erroneous `not-found` would otherwise be rejected at the queue as a repeat of the original broadcast.
- Logging of a `message-reconciled` event carries no user content; the `errors` payloads from providers are the RPC error text and must be treated as untrusted log data.

## Troubleshooting

- **Messages are `failed` with `stale-processing` and the retry budget is spent.** The executor's `execute()` either hangs or throws without a useful result. Check executor logs and RPC health; raise `maxRetries` after fixing the root cause and use `queue.retryFailed(messageId)` to resume.
- **`submitted` messages stay `deferred` forever with `provider-unavailable`.** No provider matches `destinationChainId`. Register a provider for that chain (or this chain's messages are deliberately outside reconciliation).
- **`reconciler-degraded` fires repeatedly.** Status providers are erroring. Verify RPC nodes, then confirm the first successful run that corrects a message flips the counter back to `0` and emits `reconciler-recovered`.
- **A message was resubmitted and landed twice.** `staleAfterMs` is too small relative to destination finality, or `deduplication.windowMs` is smaller than `staleAfterMs`. Both assumptions are documented above; correct them before enabling reconciliation on a network with slow finality.
- **Manual intervention.** Call `reconciler.reconcile()` directly for an on-demand pass; calls are coalesced, so concurrent callers share one run.