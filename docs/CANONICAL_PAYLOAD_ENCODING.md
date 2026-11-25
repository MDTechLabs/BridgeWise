# Maximum Payload Size and Canonical Encoding Enforcement

## 1. Objective & Scope

`CanonicalPayloadVerifier` (`contracts/bridge/CanonicalPayloadVerifier.sol`) enforces strict maximum payload size bounds and deterministic canonical binary encoding for all cross-chain bridge messages before destination-chain execution or asset release.

### Affected Contracts, Message Types, and State Transitions
- **Verifier Contract**: `contracts/bridge/CanonicalPayloadVerifier.sol` (`VERIFIER_VERSION = 1`, `CANONICAL_ENCODING_VERSION = 1`).
- **Execution Integration**: Destination-chain executors call `verifyAndConsumeCanonicalEnvelope(envelope, packedSignatures)` before executing target calls or releasing/escrowing bridged assets.
- **Allowlisted Message Types**:
  - `MSG_TYPE_TRANSFER = 1`
  - `MSG_TYPE_CONTRACT_CALL = 2`
  - `MSG_TYPE_GOVERNANCE = 3`
- **State Transitions**:
  - `consumedMessages[messageId]: false -> true`
  - `expectedNonce[sourceChainId][sender]: n -> n + 1`
  - `totalVerifiedMessages: k -> k + 1`
  - `totalVerifiedPayloadBytes: b -> b + payload.length`
  - `verifiedVolumeByChain[sourceChainId]: v -> v + amount`

---

## 2. Canonical Binary Envelope Specification (`v1`)

To eliminate ABI offset/padding malleability and trailing-byte ambiguity, every cross-chain envelope MUST conform to a fixed 231-byte header followed by exact `payloadLength` payload bytes:

| Byte Offset | Type | Field | Constraints |
| --- | --- | --- | --- |
| `0..1` | `uint8` | `encodingVersion` | Must equal `1` (`CANONICAL_ENCODING_VERSION`) |
| `1..3` | `uint16` | `messageType` | Must be `1`, `2`, or `3` |
| `3..35` | `uint256` | `sourceChainId` | Non-zero, registered, enabled, `!= block.chainid` |
| `35..67` | `uint256` | `targetChainId` | Must equal `block.chainid` |
| `67..87` | `address` | `sender` | Non-zero |
| `87..107` | `address` | `recipient` | Non-zero |
| `107..127` | `address` | `token` | Non-zero |
| `127..159` | `uint256` | `amount` | `> 0` and `<= policy.maxAmountPerMessage` |
| `159..191` | `uint256` | `nonce` | Must equal `expectedNonce[sourceChainId][sender]` |
| `191..223` | `uint256` | `deadline` | Must satisfy `deadline > block.timestamp` |
| `223..227` | `uint32` | `configVersion` | Must equal `policy.configVersion` |
| `227..231` | `uint32` | `payloadLength` | Must equal `envelope.length - 231` exactly (zero trailing bytes) |
| `231..231+N` | `bytes` | `payload` | `N <= policy.maxPayloadBytes <= 16_384`; if `N == 0`, `policy.allowEmptyPayload` must be `true` |

Canonical `messageId`:
`keccak256(abi.encode(encodingVersion, messageType, sourceChainId, targetChainId, sender, nonce))`

---

## 3. Trust Assumptions & Authorization Boundaries

| Actor | Trust Assumption | Boundary / Enforcement |
| --- | --- | --- |
| **Relayer / Caller** | **Untrusted**. May submit oversized, truncated, padded, or replayed envelopes. | Cannot call `verifyAndConsumeCanonicalEnvelope` directly; any non-canonical byte or size violation reverts fail-closed before state mutation. |
| **Executor** (`isExecutor`) | Trusted bridge router / receiver contract. | Only `isExecutor[msg.sender]` may consume `messageId` and advance `expectedNonce`. |
| **Validator Quorum** (`isValidator`, `quorumThreshold`) | At least `quorumThreshold` independent validators are honest. | EIP-712 `BridgeWiseDomain` (fork-safe) + `CanonicalPayloadAttestation` over `envelopeHash`, with EIP-2 lower-half `s` and strictly ascending signer ordering. |
| **Guardian** (`guardian`) | Emergency responder / security multisig. | May call `pause()` to immediately halt verification; cannot `unpause()` or alter policies. |
| **Admin** (`admin`) | Governance timelock / multisig. | Configures per-chain policies, validators, quorum threshold, executors, and `unpause()`. |

---

## 4. Security Invariants & Resource Bounds

1. **Exact Length & Zero Trailing Garbage**: `declaredPayloadLen == envelope.length - CANONICAL_HEADER_BYTES` and round-trip `isCanonicalEncoding(envelope)` holds bit-for-bit.
2. **Explicit Versioned Per-Chain Policies**: Unknown or disabled chains fail closed (`ChainDisabled`). Every policy update increments `configVersion`, automatically invalidating stale pre-incident attestations.
3. **Hard Gas & Resource Bounds**: `MAX_CHAINS = 32`, `MAX_VALIDATORS = 32`, `ABSOLUTE_MAX_PAYLOAD_BYTES = 16_384`. Worst-case verification (16 KiB payload + validator quorum) is bounded well under 1M gas.
4. **Replay & Cross-Chain Protection**: Persistent `consumedMessages[messageId]`, strictly monotonic `expectedNonce[sourceChainId][sender]`, and fork-safe `domainSeparator(sourceChainId)` using live `block.chainid` and `address(this)`.
5. **Accounting Conservation**: Across execution success, target revert, fallback escrow, and user refund, `executorBalance + totalReleased + totalRefunded == initialLiquidity`.

---

## 5. Deployment, Upgrade, Monitoring & Operator Recovery

- **Deployment**: Deploy with governance multisig/timelock as `admin`, emergency multisig as `guardian`, initial validator set, and `quorumThreshold`. Explicitly register each supported source chain via `setChainPayloadPolicy`.
- **Upgrades**: `CanonicalPayloadVerifier` is non-upgradeable by design to keep the canonical encoding boundary immutable and auditable. Upgrades deploy a new verifier version and update the executor's verifier pointer via governance timelock.
- **Monitoring**: Alert on `PausedStateChanged`, `ChainPayloadPolicyUpdated`, `ValidatorUpdated`, `QuorumThresholdUpdated`, and elevated `PayloadTooLarge` / `PayloadLengthMismatch` revert rates.
- **Operator Recovery**:
  - **Oversized payload DoS or malformed relayer flood**: Rejected statelessly/fail-closed; Guardian may `pause()` if systemic anomaly is detected.
  - **Chain-specific incident / reorg**: Admin disables the affected chain or tightens `maxPayloadBytes` via `setChainPayloadPolicy`, bumping `configVersion` and invalidating in-flight stale attestations.
  - **Destination target revert**: Executor catches target failure and escrows tokens for recipient `claimEscrowRefund` without breaking accounting conservation.
