# Message nonce persistence

The relayer (`apps/relayer-service`) mints a nonce for every broadcast it makes to an EVM chain (`nonce` field on the transaction) and keeps per-chain bookkeeping for its Soroban executor. Historically that counter lived only in process memory, so a restart (or a failover mid-delivery) could mint the same nonce twice — and a redelivered queue message could be broadcast twice on the destination chain.

Nonce persistence closes that gap. Every chain keeps a persisted high-water mark of *the next nonce to use*, and every message keeps a persisted *pin* of the exact nonce the message was first delivered with.

```
acquire(messageId)
   │
   ├─ pin exists for messageId? ────────────► reuse pinned nonce (idempotent redelivery)
   ├─ new message:
   │    assigned = high-water
   │    persist high-water = assigned + 1   ◄── crash-safe: recorded before broadcast
   │    persist pin  messageId → assigned
   └─ on persist failure: roll memory back, fail the delivery (never burn an unrecorded nonce)

release(messageId)   after the delivery is confirmed
   └─ best-effort remove of the pin (a failure is logged, never aborts the delivery)
```

The guarantee that makes this safe is the ordering: a nonce is **persisted before** it can be broadcast. Killing the process right after the reserve immediately re-uses nothing — the next acquire reads the persisted high-water mark and skips past it.

## What gets persisted

| State | Key | Live in | Persisted in |
| --- | --- | --- | --- |
| Chain high-water mark (next nonce) | `chainId` | `NonceManager` for the chain | store (`nonces`) |
| Per-message pin | `messageId` | `NonceManager` for the chain | store (`messageNonces`) |

A pin is created on the first `acquire`, reused verbatim on every later `acquire` of the same `messageId` (queue retry, restart, failover re-execution), and dropped by `release` once the delivery is `confirmed`. Pins for chains other than the executor's own are ignored, so a message moved to a different destination chain starts with a fresh nonce.

## Backing stores

`NonceStore` is the contract the executors persist through:

```ts
interface NonceStore {
  getNonce(chainId): Promise<number | null>;
  setNonce(chainId, nonce): Promise<void>;
  getMessageNonce(messageId): Promise<ChainNonce | null>; // { chainId, nonce }
  setMessageNonce(messageId, chainId, nonce): Promise<void>;
  removeMessageNonce(messageId): Promise<void>;
}
```

Writes are serialised per store and the store must be durable (a store that answers a `set` before the data hits stable storage is not sufficient). The relayer ships two implementations:

- **`InMemoryNonceStore`** (default) — the pre-persistence behaviour, useful for test beds and single-run jobs. Pins over `maxMessageNonces` (default 100_000) are evicted oldest-first.
- **`FileNonceStore`** — a single JSON file (`{ version: 1, nonces, messageNonces }`) rewritten atomically on every change: payload written to a temporary sibling file, optionally fsynced, then renamed over the target. Files are created `0600`. A missing file is a legitimate fresh start; a **corrupt or unreadable file fails fast** rather than resetting the counter to zero (which could re-issue nonces the chain has already used) — restore from backup, then call `reload()`.

Both stores are safe for concurrent use within one process. The file backend is **single-instance**: to run multiple replicas sharing a chain, back `NonceStore` with a transactional store instead.

## Configuration

```ts
import { EvmExecutor, FileNonceStore } from '@bridgewise/relayer-service';

const executor = new EvmExecutor({
  chainId: 'ethereum',
  chainType: 'evm',
  rpcUrl: process.env.ETH_RPC_URL,
  // ...
  nonceStore: new FileNonceStore({
    filePath: '/var/lib/relayer/nonce-state.json',
    fsync: true,                  // default: fsync every write
    maxMessageNonces: 100_000,    // default: cap on kept pins
  }),
});
```

Omitting `nonceStore` keeps today's in-memory behaviour. The same wiring applies to `SorobanExecutor` (its nonce is client-side bookkeeping; Stellar sequences are authoritative).

### NonceManager tuning

Each executor owns a `NonceManager(chainId, options)`:

| Option | Default | Purpose |
| --- | --- | --- |
| `store` | `InMemoryNonceStore` | Backing store (share the same one across replicas via a custom `NonceStore`) |
| `startNonce` | `0` | In-memory value used when the store has no value for the chain |
| `raiseOnly` | `true` | `updateNonce()` only ever raises the counter; a stale operator input can never cause reuse |

`executor.updateNonce(n)` / `executor.getNonce()` now delegate to the manager for the whole EVM chain.

## Events

| Event | Payload | When |
| --- | --- | --- |
| `nonce-loaded` | `{ chainId, nonce, source: 'store' \| 'default' }` | Initial value adopted; `default` if the store was empty |
| `nonce-assigned` | `{ chainId, messageId, nonce }` | A fresh nonce reserved *and persisted* for a message |
| `nonce-reused` | `{ chainId, messageId, nonce }` | A redelivered message reusing its pinned nonce |
| `nonce-error` | `{ chainId, messageId?, phase: 'load' \| 'persist' \| 'release', error }` | Store failures; a `persist` error fails the delivery, `load`/`release` errors are surfaced without aborting |
| `nonce-declined` | `{ chainId, nonce }` | `updateNonce()` rejected a value under the current counter (`raiseOnly`) |
| `gas-repriced` | existing payload | The reprice retry reuses the reserved nonce (unchanged event) |
| `nonce-bookkeeping` (Soroban only) | `{ chainId, messageId, nonce }` | Logged with each `sendTransaction`; Stellar sequences are authoritative, the pin only guards redelivered messages |

Broadcast and confirmation events (`transaction-submitted`, `confirmation-progress`, `gas-repriced`, `execution-error`) are unchanged, and the repricing path now reuses the reserved nonce for the replacement transaction instead of minting a new one.

## Metrics

`store.getStats()` on `FileNonceStore` / `InMemoryNonceStore` returns `{ chains, messages, evicted }`, where `evicted` counts pins dropped by the `maxMessageNonces` cap.

Operationally:

- **`nonce-error` with `phase: 'persist'`** — the store could not record a reservation. The delivery correctly failed and the counter rolled back; fix the store (disk space, permissions) — the relayer will not silently skip nonces.
- **Startup after data loss** — a *missing* state file means "fresh", a *corrupt* one means "halt": the `FileNonceStore` throws `Cannot load nonce state … refusing to reset nonces to zero`. Restore the file from backup (or, if you can prove the chain has not seen those nonces, start from an empty file deliberately).
- **Rising `messages`/`evicted`** — pins are released on confirmed deliveries; an unbounded `messages` count means deliveries are being reserved but never confirmed (check reconciliation), and `evicted` counts everything the cap dropped older than the newest 100_000.

## Dependencies

- Upstream: none hard; executors already own gas fee and confirmation logic, and repricing reuses the nonce they were handed.
- Downstream: the file store needs writable stable storage on the local instance (`mkdirSync` on the parent creates it) — put it on a real disk, not `/tmp`, if durability matters. `fsync: false` trades crash-safety of the latest write for speed and should only be used on fast-restarting test beds.
- The state file contains only nonces, never message content, secrets, or RPC keys (which belong in the executor config/environment). Still, it is `0600` and should be treated as untrusted on restore: a fabricated file with a poisoned high-water mark can only skip nonces forward, never back.
- Multi-replica: only *one* process may own a given `FileNonceStore` path at a time. Two replicas, two files, or a transactional store — document your deployment's choice.

## Troubleshooting

- **A message was broadcast twice on the destination chain.** Someone fed a store that does not actually persist, or the store lost data and was allowed to "fresh start". `NonceStore` implementations must be durable and the relayer refuses to reset a corrupt file silently for exactly this reason.
- **Deliveries fail with `nonce too low` / nonce mismatch on the EVM.** The chain is ahead of the store: rescue with `executor.updateNonce(<chainNonce+1>)` from `eth_getTransactionCount`, or raise it — `raiseOnly` will ignore anything behind the current value.
- **`nonce-error` phase `load` on every startup.** The state file is missing/undeserialisable. Restore it from backup; a corrupt file will keep failing fast until restored or until `reload()` is called after a manual fix.
- **The state file's `messages` count climbs forever.** Deliveries are reserving nonces but never confirming (stuck RPC, missing confirmations). The reconciler resubmits them with the same pinned nonce; under a healthy reconciliation the count returns to zero.
- **Manual intervention.** `store.reload()` forces a re-read after an operator restores the file; `manager.sync()` loads the persisted high-water mark for a chain up front without reserving anything.