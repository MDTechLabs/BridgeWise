# BridgeWise Cross-Chain Signature Specification

Normative specification for how BridgeWise cross-chain messages are hashed, signed,
and verified. Every message verifier, relayer client, and secondary destination-chain
integration **MUST** conform to this document.

Undocumented or divergent signature formats are the single largest source of
integration error in a bridge: a verifier that omits a field the signer included (or
vice versa) will silently reject valid messages, and — worse — a verifier that omits a
*domain* field accepts messages that were never intended for it.

---

## 1. Scope

| Applies to | Location |
| ---------- | -------- |
| EVM message verifiers | [contracts/execution/](../contracts/execution/), [contracts/core/](../contracts/core/) |
| Validator set / quorum attestation | [contracts/validator/ValidatorSetManager.sol](../contracts/validator/ValidatorSetManager.sol) |
| Replay protection | [contracts/security/TransientReplayGuard.sol](../contracts/security/TransientReplayGuard.sol) |
| Non-EVM verifiers (Soroban) | [contracts/soroban/](../contracts/soroban/) — see [§8](#8-non-evm-chains) |
| Relayer clients | Any off-chain signer producing validator attestations |

---

## 2. Signing Scheme

BridgeWise uses **EIP-712 typed structured data** (`eth_signTypedData_v4`) for all
cross-chain message attestations. Raw `keccak256(abi.encodePacked(...))` signing and
`personal_sign` (EIP-191 `0x45`) are **prohibited** for bridge messages.

The final digest submitted to `ecrecover` is:

```
digest = keccak256(0x19 ‖ 0x01 ‖ domainSeparator ‖ hashStruct(message))
```

where `‖` denotes byte concatenation.

### 2.1 Why not packed hashing

`abi.encodePacked` is ambiguous for dynamic types: two distinct payloads can collide on
the same hash (e.g. `("aa","b")` and `("a","ab")`). Every field below is therefore
encoded with `abi.encode` (32-byte padded), and dynamic fields are pre-hashed.

---

## 3. Domain Separator (Mandatory)

Every verifier **MUST** derive its domain separator from the following struct. The
`sourceChainId` / `targetChainId` pair is what binds an attestation to exactly one
directed lane; omitting either makes a signature replayable in the reverse direction
or on a sibling deployment.

```solidity
struct BridgeWiseDomain {
    string  name;             // MUST be "BridgeWise"
    string  version;          // MUST be "1"
    uint256 sourceChainId;    // MANDATORY - EIP-155 chain ID the message originated on
    uint256 targetChainId;    // MANDATORY - EIP-155 chain ID the message executes on
    address bridgeAddress;    // MANDATORY - verifier contract address on the target chain
}
```

Type hash:

```solidity
bytes32 constant BRIDGEWISE_DOMAIN_TYPEHASH = keccak256(
    "BridgeWiseDomain(string name,string version,uint256 sourceChainId,uint256 targetChainId,address bridgeAddress)"
);

domainSeparator = keccak256(
    abi.encode(
        BRIDGEWISE_DOMAIN_TYPEHASH,
        keccak256(bytes("BridgeWise")),
        keccak256(bytes("1")),
        sourceChainId,
        targetChainId,
        bridgeAddress
    )
);
```

### 3.1 Domain parameter rules

| Parameter | Rule |
| --------- | ---- |
| `name` | Fixed literal `"BridgeWise"`. Never per-deployment. |
| `version` | Bumped **only** on a breaking change to a payload type hash. A bump invalidates all in-flight signatures — coordinate with relayer operators first. |
| `sourceChainId` | EIP-155 ID of the origin chain. For non-EVM origins see [§8](#8-non-evm-chains). |
| `targetChainId` | EIP-155 ID of the chain executing the message. **MUST** equal `block.chainid` in the verifier. |
| `bridgeAddress` | `address(this)` of the verifier. Binds the signature to one deployment, so a fork or a redeployed verifier cannot accept old attestations. |

> ⚠️ The standard OpenZeppelin `EIP712` base contract uses the single-field
> `chainId` + `verifyingContract` layout. It is **not** sufficient here, because it
> cannot express the source chain. Verifiers **MUST** build the separator explicitly as
> shown above rather than inheriting `EIP712` unmodified.

### 3.2 Caching and forks

`domainSeparator` **MUST NOT** be cached in an immutable if the contract is expected to
survive a chain fork. Verifiers cache it against `block.chainid` and recompute when
`block.chainid != _cachedChainId`.

---

## 4. Message Payload Type Hash

```solidity
struct BridgeMessage {
    bytes32 messageId;      // unique per message; see §4.1
    address sender;         // origin-chain initiator
    address recipient;      // target-chain beneficiary
    address token;          // target-chain token address (address(0) = native)
    uint256 amount;         // amount in target-chain token decimals
    uint256 nonce;          // per-sender monotonic; see §5
    uint256 deadline;       // unix seconds; message invalid at/after this timestamp
    bytes32 payloadHash;    // keccak256 of the arbitrary execution calldata
}

bytes32 constant BRIDGE_MESSAGE_TYPEHASH = keccak256(
    "BridgeMessage(bytes32 messageId,address sender,address recipient,address token,uint256 amount,uint256 nonce,uint256 deadline,bytes32 payloadHash)"
);

hashStruct = keccak256(
    abi.encode(
        BRIDGE_MESSAGE_TYPEHASH,
        messageId,
        sender,
        recipient,
        token,
        amount,
        nonce,
        deadline,
        payloadHash
    )
);
```

### 4.1 Field rules

- **Dynamic fields are pre-hashed.** Arbitrary calldata is never inlined into the
  struct; it is committed to as `payloadHash = keccak256(data)` and the full `data` is
  passed alongside the signature. Verifiers **MUST** re-derive `payloadHash` from the
  supplied calldata and compare before executing.
- **`messageId` is derived, not chosen.** Canonical derivation:
  `keccak256(abi.encode(sourceChainId, targetChainId, sender, nonce))`. This makes it
  globally unique without trusting the relayer.
- **`amount` uses target-chain decimals.** Decimal normalization happens on the origin
  chain, before signing.
- **`deadline`** is compared with `block.timestamp` on the target chain. Messages with
  `block.timestamp >= deadline` **MUST** be rejected. `type(uint256).max` denotes "no
  expiry" and should only be used for governance messages.

---

## 5. Nonce Validation Requirements

Nonces are **per (sourceChainId, sender)** and strictly monotonic.

1. Verifiers **MUST** maintain `mapping(uint256 sourceChainId => mapping(address sender => uint256 nonce))`.
   A single global nonce counter is **prohibited** — it serializes unrelated senders and
   makes head-of-line blocking a liveness bug.
2. A message is accepted only if `message.nonce == expectedNonce[sourceChainId][sender]`;
   the stored value is incremented **before** any external call (checks-effects-interactions).
3. Nonce state **MUST** be persistent storage. `TransientReplayGuard` (EIP-1153) protects
   only *within* a single transaction and is a complement to, never a replacement for,
   persistent nonce tracking.
4. Gaps are not permitted. A relayer that observes a gap must backfill the missing
   nonce before the later message can execute.
5. Nonce state is **never** reset on validator set rotation. Rotating keys does not
   invalidate the ordering of already-signed messages.

### 5.1 Replay surface checklist

A message is replayable unless **all** of the following hold:

- [ ] `sourceChainId` is in the domain separator
- [ ] `targetChainId` is in the domain separator and equals `block.chainid`
- [ ] `bridgeAddress` is in the domain separator and equals `address(this)`
- [ ] `nonce` is consumed from persistent per-sender storage
- [ ] `messageId` is recorded in a persistent executed-set
- [ ] `deadline` is enforced against `block.timestamp`

---

## 6. Signature Encoding and Quorum

- Signatures are 65-byte `(r, s, v)`. `v` is `27` or `28`.
- **Malleability:** `s` **MUST** be in the lower half order
  (`s <= 0x7FFF...5D576E7357A4501DDFE92F46681B20A0`). Use OpenZeppelin's `ECDSA.recover`,
  which rejects the upper range, rather than bare `ecrecover`.
- **Zero address:** a recovery result of `address(0)` **MUST** be treated as failure.
- **Ordering:** multi-signature bundles **MUST** be supplied with signer addresses in
  strictly ascending order. This makes duplicate-signer detection an O(n) comparison
  instead of an O(n²) scan, and duplicates **MUST** revert.
- **Quorum:** the number of valid, distinct signers must be `>= activeThreshold` as
  reported by [ValidatorSetManager](../contracts/validator/ValidatorSetManager.sol).
- **Rotation overlap:** during the `OVERLAP_WINDOW` following a validator set
  activation, signatures from the outgoing set remain valid. Quorum is evaluated
  against the set the signer belongs to; a bundle **MUST NOT** mix sets to reach quorum.

---

## 7. Verifier Implementation Checklist

Order of operations for any new message verifier:

1. Recompute `domainSeparator`; assert `targetChainId == block.chainid` and
   `bridgeAddress == address(this)`.
2. Assert `sourceChainId` is a registered lane.
3. Assert `block.timestamp < deadline`.
4. Recompute `payloadHash` from supplied calldata; compare to the signed field.
5. Recompute `messageId`; assert not already in the executed set.
6. Recompute `digest`; recover signers; assert ascending order, no duplicates, quorum met.
7. Assert `nonce == expectedNonce[sourceChainId][sender]`; increment.
8. Mark `messageId` executed; acquire the transient replay lock.
9. **Only then** perform external calls / token transfers.

---

## 8. Non-EVM Chains

Soroban (Stellar) verifiers cannot use `ecrecover`, but **MUST** preserve the same
domain binding. For non-EVM chains:

- `sourceChainId` / `targetChainId` use the BridgeWise-assigned synthetic IDs registered
  in the chain config (see [DYNAMIC_CHAIN_CONFIG_MANAGEMENT.md](./DYNAMIC_CHAIN_CONFIG_MANAGEMENT.md)),
  not EIP-155 IDs.
- `bridgeAddress` is the 32-byte contract ID, left-padded when it must occupy an
  `address`-shaped slot in an EVM-side struct.
- The digest is the same `0x19 0x01 ‖ domainSeparator ‖ hashStruct` byte string; only
  the signature primitive differs (Ed25519 / BLS as per
  [contracts/soroban/bls_verifier/](../contracts/soroban/bls_verifier/)).

---

## 9. Versioning

| Change | Requires `version` bump? |
| ------ | ------------------------ |
| Adding a field to `BridgeMessage` | Yes — the type hash changes |
| Reordering fields | Yes |
| Adding a new message struct alongside the existing one | No |
| Deploying to a new chain | No — `targetChainId` already distinguishes it |
| Rotating the validator set | No |

A `version` bump **MUST** be announced to relayer operators before deployment;
in-flight signatures signed under the previous version become permanently invalid.

---

_Document Version: 1.0.0_
