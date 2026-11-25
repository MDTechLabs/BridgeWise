# Independent Verification of Relayer-Supplied Message Metadata

## 1. Objective & Scope

`RelayerMetadataVerifier` (`contracts/bridge/RelayerMetadataVerifier.sol`) enforces fail-closed, independent on-chain verification of all cross-chain message metadata supplied by untrusted relayers before any destination-chain execution or asset release occurs.

### Affected Contracts, Message Types, and State Transitions
- **Verifier Contract**: `contracts/bridge/RelayerMetadataVerifier.sol` (`VERIFIER_VERSION = 1`).
- **Execution Integration**: Destination-chain executors (e.g., `MessageReceiverCore` / bridge routers) call `verifyAndConsumeMetadata(meta, data, packedSignatures)` before releasing or escrowing assets.
- **Message Type**: `MessageMetadata` bound to EIP-712 `BridgeWiseDomain` (per `docs/SIGNATURE_SPECIFICATION.md`) and `RelayerMetadataAttestation` (including `sourceBlockNumber`, `sourceTimestamp`, `payloadHash`, and `configVersion`).
- **State Transitions**:
  - `consumedMessages[canonicalMessageId]: false -> true`
  - `expectedNonce[sourceChainId][sender]: n -> n + 1`
  - `totalVerifiedMessages: k -> k + 1`
  - `verifiedVolumeByChain[sourceChainId]: v -> v + amount`

---

## 2. Trust Assumptions & Authorization Boundaries

| Actor | Trust Assumption | Boundary / Enforcement |
| --- | --- | --- |
| **Relayer** | **Untrusted**. May forge, reorder, replay, truncate, or front-run any metadata field. | Cannot call `verifyAndConsumeMetadata` directly; all relayer-supplied fields are independently re-derived and verified against quorum attestations and on-chain chain policies. |
| **Executor** (`isExecutor`) | Trusted bridge router / receiver contract. | Only `isExecutor[msg.sender]` may consume `messageId` and advance `expectedNonce`. |
| **Checkpoint Attester** (`isCheckpointAttester`) | Independent light-client or finalized-checkpoint oracle. | Only `isCheckpointAttester[msg.sender]` may advance `finalizedSourceBlock[sourceChainId]`, and only strictly monotonically. |
| **Validator Quorum** (`isValidator`, `quorumThreshold`) | At least `quorumThreshold` independent validators are honest. | Signatures are verified over the EIP-712 digest with EIP-2 lower-half `s` enforcement and strictly ascending signer ordering. |
| **Guardian** (`guardian`) | Emergency responder / security multisig. | May call `pause()` to immediately halt verification and checkpoint updates; cannot `unpause()` or alter policies. |
| **Admin** (`admin`) | Governance timelock / multisig. | Configures chain policies, validators, quorum threshold, executors, attesters, and `unpause()`. |

---

## 3. Security Invariants

1. **No Implicit Chain Parameters**: Every supported `sourceChainId` must be explicitly registered and enabled via `setChainPolicy`. Unknown or disabled chains fail closed (`ChainDisabled`).
2. **Fork & Cross-Chain Replay Resistance**: `domainSeparator(sourceChainId)` uses live `block.chainid` and `address(this)`. `meta.targetChainId` must equal `block.chainid` and `meta.sourceChainId != block.chainid`.
3. **Canonical Derivation**: `meta.messageId` must equal `keccak256(abi.encode(sourceChainId, targetChainId, sender, nonce))` and `meta.payloadHash` must equal `keccak256(data)`.
4. **No Replay / No Gaps**: `consumedMessages[messageId]` must be `false` and `meta.nonce == expectedNonce[sourceChainId][sender]`.
5. **Reorg & Partial-Failure Safety**: `meta.sourceBlockNumber` must be at least `policy.requiredConfirmations` deep beneath `finalizedSourceBlock[sourceChainId]`. If the checkpoint attester is unavailable during a network partition, `finalizedSourceBlock` stops advancing and new messages fail closed until finality is independently confirmed.
6. **Bounded Work (DoS Resistance)**: `MAX_CHAINS = 32`, `MAX_VALIDATORS = 32`, `MAX_PAYLOAD_BYTES = 16_384`. All verification loops are strictly bounded by `sigCount <= MAX_VALIDATORS`.
7. **Accounting Conservation**: On destination execution success, revert, retry, or fallback escrow/refund, total locked/escrowed/released token balances plus verified accounting counters remain conserved.

---

## 4. Deployment, Upgrade, Monitoring & Operator Recovery

- **Deployment**: Deploy with governance multisig/timelock as `admin`, emergency multisig as `guardian`, initial sorted validator set, and `quorumThreshold`. Register each supported source chain with explicit `requiredConfirmations`, `maxMessageAgeSecs`, `maxFutureDriftSecs`, and `maxAmountPerMessage`.
- **Upgrades**: `RelayerMetadataVerifier` is non-upgradeable by design to keep the verification boundary immutable and auditable. Upgrades are performed by deploying a new verifier version and updating the executor's verifier reference via governance timelock.
- **Monitoring**: Alert on `PausedStateChanged`, `ChainPolicyUpdated`, `ValidatorUpdated`, `QuorumThresholdUpdated`, `FinalizedSourceBlockUpdated` stalls, and elevated `MetadataVerified` revert rates.
- **Operator Recovery**:
  - **Compromised relayer**: No state change required; relayer cannot forge metadata without validator quorum.
  - **Source-chain reorg / partition**: Guardian calls `pause()` or Admin disables the affected chain via `setChainPolicy(sourceChainId, false, ...)`. Once finality stabilizes, Admin re-enables the chain (bumping `configVersion`, which automatically invalidates stale pre-incident attestations).
  - **Execution target revert**: Executor catches target failure and routes funds to `FallbackEscrow` for user claim/refund without losing accounting conservation.
