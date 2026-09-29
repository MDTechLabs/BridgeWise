# Cross-chain message validation

The relayer (`apps/relayer-service`) validates the shape of every cross-chain message before it is queued, so a malformed message can never reach a chain executor. Validation is the relayer's second line of defence, after structural checks and alongside [duplicate detection](CROSS_CHAIN_DUPLICATE_MESSAGE_DETECTION.md). It does not replace on-chain signature or nonce verification (see [Dependencies](#dependencies)).

## Why validate before queueing

A message that reaches `EvmExecutor` becomes a real transaction. `payload` is forwarded verbatim as calldata, `maxGasLimit` is parsed as an integer, and `recipient` becomes the call target. Passing an unchecked message straight through turns a producer bug or a hostile payload into a failed transaction, wasted gas, and a retry loop that burns the retry budget on a message that can never succeed.

Rejecting at intake means the message is never queued, never retried, and never billed.

## What counts as malformed

`MessageQueue.enqueue()` validates before it does anything else, and returns `false` when the message is rejected.

Validation reports **structure**, not policy. Whether a well-formed transfer is *wanted* is a separate concern handled by duplicate detection and by destination-chain contracts.

| Field | Rule |
| --- | --- |
| *(message)* | Must be a non-null, non-array object |
| `id` | Required, non-blank string, at most 200 characters |
| `sourceChainId` / `destinationChainId` | Required, non-blank strings, and must differ from each other |
| `sourceTxHash` | Required. Hex or base64 of even length, with or without a `0x` prefix. EVM and Stellar hashes are hex; Solana-style RPC backends return base64 |
| `sourceBlockNumber` | Required, non-negative safe integer |
| `sourceLogIndex` | Optional, non-negative safe integer when present |
| `messageType` | Required, non-blank, at most 64 characters |
| `payload` | Required, non-empty. When `0x`-prefixed it must be hex of even length |
| `sender` / `recipient` | Required, non-blank strings |
| `amount` | Optional. Base-10 integer of token units. `0` is valid |
| `maxGasLimit` | Optional. Positive base-10 integer when present |
| `createdAt` | Required, non-negative safe integer of milliseconds |
| `status` | Required, one of `MESSAGE_STATUSES` |
| `retryCount` | Required, non-negative safe integer |
| `lastError` | Optional string |

A missing field is reported separately from a field of the wrong type, so a truncated indexer payload can be told apart from one that lost its type information in transit. Every problem is reported in one pass rather than failing on the first, so an operator sees everything that is wrong with a message at once.

`amount` accepts `0` on purpose: zero-value transfers are legitimate. Negative, fractional and scientific-notation amounts are rejected, since token amounts are integers in base-10 units and anything else cannot be moved safely.

## Events

| Event | Payload |
| --- | --- |
| `message-rejected` | `{ messageId?, reason: 'malformed', errors: [{ field, code, message }] }` |

`messageId` is `undefined` when the field is missing or not a string, so the event stays loggable for a message that never had a usable ID.

`message-rejected` and `duplicate-message` are mutually exclusive. A message that is both malformed and a duplicate is reported as malformed: a structurally broken message should never be counted as an accepted-then-rejected duplicate.

`queue.getValidationStats()` returns `{ checked, accepted, rejected }`, or zeros when validation is disabled. These counters describe validation outcomes only; duplicate rejections are reported by `getDuplicateStats()`. Track the `rejected` rate by error `code`, never by message or transaction ID. A sustained rise points at a broken producer, and a sudden jump in one code usually names the regression.

## Ordering

Validation runs **before** duplicate detection. A malformed message never reaches `DuplicateMessageDetector`, so it cannot consume a slot in the detector's `windowMs` / `maxEntries` budget and evict a legitimate message. Two consequences worth knowing:

- A well-formed message may reuse the ID of a previously rejected one.
- Rejected messages are never retried, because they were never queued.

## Configuration

```ts
import { MessageQueue } from '@bridgewise/relayer-service';

const queue = new MessageQueue({
  validation: {
    enforceAddressFormat: true, // default: false
    maxIdLength: 200,            // default
    maxPayloadLength: 1_000_000, // default
  },
});

queue.on('message-rejected', (e) =>
  alerting.page('relayer.message_rejected', { codes: e.errors.map((err) => err.code) }),
);
```

- `enforceAddressFormat` validates `sender` and `tokenAddress` against the format of the chain named in `sourceChainId`, and `recipient` against the chain named in `destinationChainId`. It is **off by default** because the queue is chain-agnostic and both chain IDs are free-form strings. Turn it on once a deployment knows its supported chain IDs.
- `maxPayloadLength` bounds memory per message. A `PAYLOAD_TOO_LARGE` rejection on messages you expect to succeed means the limit is too low for your payloads.
- `validation: false` accepts messages unvalidated. This is only safe when every producer is already trusted and schema-checked, and it restores the previous behaviour exactly.

### Address formats

`resolveChainType()` maps a chain ID to a chain family, and an unrecognised chain is left unconstrained rather than rejected, so a new chain does not break intake:

| Chain type | Chain IDs recognised | Address pattern |
| --- | --- | --- |
| `evm` | `ethereum`, `polygon`, `base`, `arbitrum`, `optimism`, `avalanche`, `bsc`, `evm`, and the matching testnets | `0x` + 40 hex characters |
| `soroban` | `stellar`, `soroban` | `G`/`C` + 55 base32 characters (case-sensitive) |
| `solana` | `solana`, `spl` | 32–44 base58 characters |

## Using validation outside the queue

```ts
import {
  validateCrossChainMessage,
  isValidCrossChainMessage,
  assertValidCrossChainMessage,
} from '@bridgewise/relayer-service';

const { valid, errors } = validateCrossChainMessage(candidate, { enforceAddressFormat: true });

if (isValidCrossChainMessage(candidate)) {
  // narrowed to CrossChainMessage
}

assertValidCrossChainMessage(candidate); // throws, naming each offending field
```

These are exported for ingestion paths that want to reject a malformed message before constructing it, or that need to map a rejection onto their own error response. `assertValidCrossChainMessage` throws an error naming every offending `field: code` pair, which suits a call site that cannot continue.

## Limitations

- Validation is not verification. It does not check signatures, nonces, deadlines or quorum, and a well-formed message is not necessarily an authorised one. See `docs/SIGNATURE_SPECIFICATION.md` for the intended verification design and note that no TypeScript implementation of it exists yet.
- Address format enforcement covers the chains listed above. A chain not on that list gets structural validation only, so a wrong-namespace address on that chain passes.
- `amount` and `maxGasLimit` are checked for shape, not for magnitude. A well-formed but economically absurd amount is not rejected here.
- Validation state is per-message and holds nothing between calls, so there is no restart or replication concern, unlike the duplicate detector.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `MISSING_*` for many fields at once | The producer is emitting a different shape than the relayer expects. Check the producer against the field table above. |
| `ODD_LENGTH_HEX_PAYLOAD` | Calldata was hex-encoded one character at a time from a byte string of odd length. Re-encode with `ethers.utils.hexlify` or equivalent. |
| `INVALID_AMOUNT` | An amount arrived as a float, in scientific notation, or as a `BigNumber` that serialised with a sign or exponent. Serialise as a base-10 integer string. |
| `SAME_SOURCE_AND_DESTINATION` | A routing bug. A message cannot bridge to the chain it came from. |
| `INVALID_ADDRESS_FORMAT` with `enforceAddressFormat` on | The address is in the wrong namespace for its chain, or the chain ID is not recognised so the check was skipped. |
| `MESSAGE_ID_TOO_LONG` / `PAYLOAD_TOO_LARGE` | The configured limits are lower than this producer's output. Raise them, or fix the producer. |
| Rejected messages are not retried | Intended. A malformed message is never queued, so it never enters the retry path. Correct the producer instead. |

## Dependencies

| Component | Relationship |
| --- | --- |
| Source-chain watchers / indexers (e.g. `src/indexer/soroban`) | Upstream. Must produce messages matching the field table. A producer that emits raw `BigNumber` amounts or float block numbers is the most common source of rejections. |
| `DuplicateMessageDetector` | Downstream of validation. Unaffected: it only sees messages that already passed. |
| `EvmExecutor` / `SorobanExecutor` | Downstream. Receive only validated messages. `EvmExecutor` still parses `maxGasLimit` and forwards `payload` as calldata, so it must keep tolerating values it would now never see. |
| `CanaryRolloutRouter` | Unaffected. Validation happens before routing. |
| `validateTransferPayload` (`src/validation/integrity/stellar`) | Parallel layer. Validates a decoded Soroban transfer payload, not the relayer's message envelope. The two do not overlap and neither replaces the other. |
| Destination contracts (`contracts/`) | Downstream. Must enforce their own signature, nonce and replay protection. Relayer-side validation checks shape only. |
| Shared store (Redis or database) | Not required. Validation is stateless. Contrast with the duplicate detector, which is in-memory and not shared between replicas. |
