# Cross-chain duplicate message detection

The relayer (`apps/relayer-service`) rejects cross-chain messages it has already accepted, so a re-delivered message cannot be executed twice on the destination chain. This is the relayer's first line of defence. It does not replace on-chain replay protection (see [Dependencies](#dependencies)).

Structural validation runs before detection: a malformed message is rejected outright and never reaches the detector. See [Cross-chain message validation](CROSS_CHAIN_MESSAGE_VALIDATION.md).

Once a message is accepted it is tracked through delivery. If the queue's local view of a message's state ever diverges from the destination chain - a hung executor, a lost completion callback, a receipt that never finalised - see [Message status reconciliation](MESSAGE_STATUS_RECONCILIATION.md), which repairs that divergence.

## What counts as a duplicate

`MessageQueue.enqueue()` checks every message before queueing it and returns `false` when it is rejected.

| Reason | Meaning | Typical cause |
| --- | --- | --- |
| `message-id` | Same ID, same content | Watcher or indexer re-delivers a message, e.g. after a restart |
| `fingerprint` | New ID, same source event and content | Indexer re-scan or reorg handling assigns a fresh ID to an event already relayed |
| `message-id-conflict` | Same ID, **different** content | ID-generation bug or a spoofed message. Investigate: this is never benign |

A message is a duplicate while it is pending, in flight, failed or completed in the queue, and for as long as the detector window lasts after it is first accepted, whichever is longer.

### Fingerprint

`computeMessageFingerprint()` is a SHA-256 over:

`sourceChainId`, `destinationChainId`, `sourceTxHash`, `sourceLogIndex`, `messageType`, `payload`, `sender`, `recipient`, `tokenAddress`, `amount`

- `0x` hex values are lower-cased. Other values, such as Stellar StrKeys, stay case-sensitive.
- Relayer-assigned or mutable fields (`id`, `status`, `retryCount`, `createdAt`, `lastError`) are excluded.
- `sourceBlockNumber` is excluded because a reorg can re-include the same transaction in a different block.
- **Producers must set `sourceLogIndex`** when one source transaction can emit more than one message with identical content. Without it, the second message is treated as a duplicate of the first.

## Events

| Event | Payload |
| --- | --- |
| `duplicate-message` | `{ messageId, reason, originalMessageId, fingerprint, occurrences? }` |
| `message-id-conflict` | Same as above. Emitted in addition to `duplicate-message` |

Payloads carry no message body, amounts or addresses. Alert on `message-id-conflict`. Track the `duplicate-message` rate by `reason` only, never by message or transaction ID. A sustained rise usually points to an upstream watcher or indexer problem.

`queue.getDuplicateStats()` returns `{ tracked, checked, duplicates, conflicts, evicted }`, or `null` when detection is disabled.

## Configuration

```ts
import { MessageQueue } from '@bridgewise/relayer-service';

const queue = new MessageQueue({
  deduplication: {
    windowMs: 24 * 60 * 60 * 1000, // default: 24h
    maxEntries: 100_000,           // default
  },
});

queue.on('message-id-conflict', (e) => alerting.page('relayer.message_id_conflict', { reason: e.reason }));
```

- `windowMs` must be longer than the longest time a source event can be re-delivered: indexer re-scan depth, watcher restart backfill and the reorg horizon of the slowest source chain.
- `maxEntries` bounds memory. If eviction happens before `windowMs` ends (`evicted` grows while traffic is steady), raise it, because the fingerprint window is then shorter than configured.
- `deduplication: false` turns off content fingerprinting. ID checks against the queue's own state still apply.
- `DuplicateMessageDetector` is exported for use outside the queue, such as in the ingestion path.

## Limitations

- State is in process memory. It is lost on restart and not shared between relayer replicas. With several replicas, route each source chain's messages to a single replica, or back the detector with a shared store before scaling out.
- `queue.clear()` also clears the detector.
- `retryFailed()` and `retryAllFailed()` re-queue a failed message deliberately and are not blocked by detection.

## Dependencies

| Component | Relationship |
| --- | --- |
| Source-chain watchers / indexers (e.g. `src/indexer/soroban`) | Upstream. Must produce a stable `id` per source event and populate `sourceLogIndex` where one tx can emit several messages. |
| Destination contracts (`contracts/`) | Downstream. Must enforce their own replay protection (processed-message nonce or hash). Relayer-side detection is in-memory and best-effort, so it cannot stand in for this. |
| `EvmExecutor` / `SorobanExecutor` | Only receive messages that passed detection. No change required. |
| `CanaryRolloutRouter` | Unaffected. Detection happens before routing, and the runbook's "duplicate execution" signal should be read with these events. |
| Shared store (Redis or database) | Future dependency for multi-replica deployments. Not implemented. |

## Related changes

Rejecting in-flight messages required the queue to keep the in-flight item, not just its ID. That also fixed retries: before, `complete()` could never find a failed in-flight message, so failures were neither retried nor moved to the failed list. `maxRetries` now means the number of retries after the first attempt. With the default of 5, a message is attempted up to 6 times.
