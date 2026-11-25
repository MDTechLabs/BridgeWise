// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RelayerMetadataVerifier
/// @notice Independent on-chain verifier for relayer-supplied cross-chain message metadata.
/// @dev Enforces fail-closed, versioned, gas-bounded verification of all security-critical
///      metadata fields supplied by untrusted relayers:
///      - Canonical `messageId` derivation: `keccak256(abi.encode(sourceChainId, targetChainId, sender, nonce))`
///      - Canonical `payloadHash` derivation: `keccak256(data)`
///      - Explicit `targetChainId == block.chainid` and enabled `sourceChainId != block.chainid`
///      - Per-chain versioned policy bounds (confirmations, clock skew, future drift, max amount)
///      - Source-chain finality check against independently attested `finalizedSourceBlock[sourceChainId]`
///      - Strictly monotonic per-(sourceChainId, sender) nonce and persistent `consumedMessages` replay set
///      - EIP-712 `BridgeWiseDomain` (fork-safe, recomputed if `block.chainid` changes) +
///        `RelayerMetadataAttestation` quorum verification with lower-half `s` malleability protection
///        and strictly ascending signer ordering (O(n) duplicate rejection, n <= MAX_VALIDATORS).
contract RelayerMetadataVerifier {
    // =========================================================================
    // Constants & Versioning
    // =========================================================================

    uint256 public constant VERIFIER_VERSION = 1;

    uint32 public constant MAX_CHAINS = 32;
    uint32 public constant MAX_VALIDATORS = 32;
    uint32 public constant MIN_CONFIRMATIONS = 1;
    uint32 public constant MAX_CONFIRMATIONS = 256;
    uint64 public constant MIN_MESSAGE_AGE_SECS = 10;
    uint64 public constant MAX_MESSAGE_AGE_SECS = 7 days;
    uint64 public constant MAX_FUTURE_DRIFT_SECS = 1 hours;
    uint256 public constant MAX_PAYLOAD_BYTES = 16_384;

    /// @dev Half of secp256k1 curve order `n` for EIP-2 signature malleability rejection.
    uint256 private constant SECP256K1_N_DIV_2 =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    bytes32 public constant DOMAIN_NAME_HASH = keccak256("BridgeWise");
    bytes32 public constant DOMAIN_VERSION_HASH = keccak256("1");

    /// @dev Matches docs/SIGNATURE_SPECIFICATION.md §3.
    bytes32 public constant BRIDGEWISE_DOMAIN_TYPEHASH = keccak256(
        "BridgeWiseDomain(string name,string version,uint256 sourceChainId,uint256 targetChainId,address bridgeAddress)"
    );

    /// @dev Binds all relayer-supplied metadata fields to an independent validator quorum attestation.
    bytes32 public constant METADATA_ATTESTATION_TYPEHASH = keccak256(
        "RelayerMetadataAttestation(bytes32 messageId,uint256 sourceChainId,uint256 targetChainId,address sender,address recipient,address token,uint256 amount,uint256 nonce,uint64 sourceBlockNumber,uint64 sourceTimestamp,uint256 deadline,bytes32 payloadHash,uint32 configVersion)"
    );

    // =========================================================================
    // Types
    // =========================================================================

    struct ChainMetadataPolicy {
        bool enabled;
        uint32 configVersion;
        uint32 requiredConfirmations;
        uint64 maxMessageAgeSecs;
        uint64 maxFutureDriftSecs;
        uint256 maxAmountPerMessage;
    }

    struct MessageMetadata {
        bytes32 messageId;
        uint256 sourceChainId;
        uint256 targetChainId;
        address sender;
        address recipient;
        address token;
        uint256 amount;
        uint256 nonce;
        uint64 sourceBlockNumber;
        uint64 sourceTimestamp;
        uint256 deadline;
        bytes32 payloadHash;
    }

    // =========================================================================
    // Storage
    // =========================================================================

    address public admin;
    address public guardian;
    bool public paused;

    uint32 public validatorCount;
    uint32 public quorumThreshold;
    mapping(address => bool) public isValidator;
    mapping(address => bool) public isExecutor;
    mapping(address => bool) public isCheckpointAttester;

    uint32 public configuredChainCount;
    mapping(uint256 => bool) public isChainRegistered;
    mapping(uint256 => ChainMetadataPolicy) private _chainPolicies;

    /// @notice Independently attested finalized block height per source chain.
    /// @dev Monotonically increasing; never inferred from untrusted relayer metadata.
    mapping(uint256 => uint64) public finalizedSourceBlock;

    /// @notice Persistent replay protection keyed by canonical `messageId`.
    mapping(bytes32 => bool) public consumedMessages;

    /// @notice Strictly monotonic per-(sourceChainId, sender) expected nonce.
    mapping(uint256 => mapping(address => uint256)) public expectedNonce;

    /// @notice Accounting counters for invariant verification and monitoring.
    uint256 public totalVerifiedMessages;
    mapping(uint256 => uint256) public verifiedVolumeByChain;

    // =========================================================================
    // Events
    // =========================================================================

    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event PausedStateChanged(bool paused, address indexed actor);
    event ExecutorUpdated(address indexed executor, bool allowed);
    event CheckpointAttesterUpdated(address indexed attester, bool allowed);
    event ValidatorUpdated(address indexed validator, bool active, uint32 newValidatorCount);
    event QuorumThresholdUpdated(uint32 previousThreshold, uint32 newThreshold);
    event ChainPolicyUpdated(
        uint256 indexed sourceChainId,
        bool enabled,
        uint32 configVersion,
        uint32 requiredConfirmations,
        uint64 maxMessageAgeSecs,
        uint64 maxFutureDriftSecs,
        uint256 maxAmountPerMessage
    );
    event FinalizedSourceBlockUpdated(
        uint256 indexed sourceChainId,
        uint64 previousBlockNumber,
        uint64 newBlockNumber,
        address indexed attester
    );
    event MetadataVerified(
        bytes32 indexed messageId,
        uint256 indexed sourceChainId,
        address indexed sender,
        address recipient,
        address token,
        uint256 amount,
        uint256 nonce,
        uint64 sourceBlockNumber,
        uint32 configVersion,
        address executor
    );

    // =========================================================================
    // Errors
    // =========================================================================

    error UnauthorizedAdmin();
    error UnauthorizedGuardian();
    error UnauthorizedExecutor();
    error UnauthorizedAttester();
    error ContractPaused();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidChainId();
    error ChainDisabled(uint256 sourceChainId);
    error InvalidChainPolicy();
    error TooManyChains();
    error TooManyValidators();
    error InvalidQuorumThreshold();
    error LengthMismatch();
    error NonMonotonicFinalizedBlock(uint64 currentBlock, uint64 suppliedBlock);
    error TargetChainMismatch(uint256 expectedChainId, uint256 suppliedChainId);
    error PayloadTooLarge(uint256 length, uint256 maxLength);
    error PayloadHashMismatch(bytes32 expectedHash, bytes32 suppliedHash);
    error MessageIdMismatch(bytes32 expectedMessageId, bytes32 suppliedMessageId);
    error MessageAlreadyConsumed(bytes32 messageId);
    error InvalidNonce(uint256 expected, uint256 supplied);
    error MessageExpired(uint256 deadline, uint256 currentTimestamp);
    error ZeroSourceTimestamp();
    error SourceTimestampTooOld(uint64 sourceTimestamp, uint64 currentTimestamp, uint64 maxAge);
    error SourceTimestampInFuture(uint64 sourceTimestamp, uint64 currentTimestamp, uint64 maxDrift);
    error ZeroSourceBlockNumber();
    error SourceBlockNotFinalized(uint64 sourceBlockNumber, uint64 finalizedBlock, uint32 requiredConfirmations);
    error AmountExceedsChainLimit(uint256 amount, uint256 maxAmount);
    error InvalidSignatureLength();
    error TooManySignatures(uint256 supplied, uint256 maxAllowed);
    error InvalidSignatureV(uint256 index, uint8 v);
    error MalleableSignatureS(uint256 index);
    error InvalidRecoveredSigner(uint256 index);
    error UnsortedOrDuplicateSigner(uint256 index);
    error QuorumNotMet(uint256 validSignatures, uint256 requiredThreshold);

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier onlyAdmin() {
        if (msg.sender != admin) revert UnauthorizedAdmin();
        _;
    }

    modifier onlyGuardianOrAdmin() {
        if (msg.sender != guardian && msg.sender != admin) revert UnauthorizedGuardian();
        _;
    }

    modifier onlyExecutor() {
        if (!isExecutor[msg.sender]) revert UnauthorizedExecutor();
        _;
    }

    modifier onlyAttester() {
        if (!isCheckpointAttester[msg.sender]) revert UnauthorizedAttester();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(
        address initialAdmin,
        address initialGuardian,
        address[] memory initialValidators,
        uint32 initialQuorumThreshold
    ) {
        if (initialAdmin == address(0) || initialGuardian == address(0)) revert ZeroAddress();
        if (initialValidators.length == 0 || initialValidators.length > MAX_VALIDATORS) {
            revert TooManyValidators();
        }
        if (initialQuorumThreshold == 0 || initialQuorumThreshold > initialValidators.length) {
            revert InvalidQuorumThreshold();
        }

        admin = initialAdmin;
        guardian = initialGuardian;
        emit AdminTransferred(address(0), initialAdmin);
        emit GuardianUpdated(address(0), initialGuardian);

        for (uint256 i = 0; i < initialValidators.length; i++) {
            address val = initialValidators[i];
            if (val == address(0)) revert ZeroAddress();
            if (!isValidator[val]) {
                isValidator[val] = true;
                validatorCount += 1;
                emit ValidatorUpdated(val, true, validatorCount);
            }
        }

        if (initialQuorumThreshold > validatorCount) revert InvalidQuorumThreshold();
        quorumThreshold = initialQuorumThreshold;
        emit QuorumThresholdUpdated(0, initialQuorumThreshold);
    }

    // =========================================================================
    // Governance & Operator Controls
    // =========================================================================

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        address prev = admin;
        admin = newAdmin;
        emit AdminTransferred(prev, newAdmin);
    }

    function setGuardian(address newGuardian) external onlyAdmin {
        if (newGuardian == address(0)) revert ZeroAddress();
        address prev = guardian;
        guardian = newGuardian;
        emit GuardianUpdated(prev, newGuardian);
    }

    function pause() external onlyGuardianOrAdmin {
        paused = true;
        emit PausedStateChanged(true, msg.sender);
    }

    function unpause() external onlyAdmin {
        paused = false;
        emit PausedStateChanged(false, msg.sender);
    }

    function setExecutor(address executor, bool allowed) external onlyAdmin {
        if (executor == address(0)) revert ZeroAddress();
        isExecutor[executor] = allowed;
        emit ExecutorUpdated(executor, allowed);
    }

    function setCheckpointAttester(address attester, bool allowed) external onlyAdmin {
        if (attester == address(0)) revert ZeroAddress();
        isCheckpointAttester[attester] = allowed;
        emit CheckpointAttesterUpdated(attester, allowed);
    }

    function setValidator(address validator, bool active) external onlyAdmin {
        if (validator == address(0)) revert ZeroAddress();
        bool currentlyActive = isValidator[validator];
        if (currentlyActive == active) return;

        if (active) {
            if (validatorCount >= MAX_VALIDATORS) revert TooManyValidators();
            isValidator[validator] = true;
            validatorCount += 1;
        } else {
            if (validatorCount - 1 < quorumThreshold) revert InvalidQuorumThreshold();
            isValidator[validator] = false;
            validatorCount -= 1;
        }
        emit ValidatorUpdated(validator, active, validatorCount);
    }

    function setQuorumThreshold(uint32 newThreshold) external onlyAdmin {
        if (newThreshold == 0 || newThreshold > validatorCount) revert InvalidQuorumThreshold();
        uint32 prev = quorumThreshold;
        quorumThreshold = newThreshold;
        emit QuorumThresholdUpdated(prev, newThreshold);
    }

    /// @notice Explicitly configure or update versioned metadata verification policy for a source chain.
    function setChainPolicy(
        uint256 sourceChainId,
        bool enabled,
        uint32 requiredConfirmations,
        uint64 maxMessageAgeSecs,
        uint64 maxFutureDriftSecs,
        uint256 maxAmountPerMessage
    ) external onlyAdmin {
        if (sourceChainId == 0 || sourceChainId == block.chainid) revert InvalidChainId();
        if (
            requiredConfirmations < MIN_CONFIRMATIONS ||
            requiredConfirmations > MAX_CONFIRMATIONS ||
            maxMessageAgeSecs < MIN_MESSAGE_AGE_SECS ||
            maxMessageAgeSecs > MAX_MESSAGE_AGE_SECS ||
            maxFutureDriftSecs > MAX_FUTURE_DRIFT_SECS
        ) {
            revert InvalidChainPolicy();
        }

        if (!isChainRegistered[sourceChainId]) {
            if (configuredChainCount >= MAX_CHAINS) revert TooManyChains();
            isChainRegistered[sourceChainId] = true;
            configuredChainCount += 1;
        }

        uint32 nextVersion = _chainPolicies[sourceChainId].configVersion + 1;
        _chainPolicies[sourceChainId] = ChainMetadataPolicy({
            enabled: enabled,
            configVersion: nextVersion,
            requiredConfirmations: requiredConfirmations,
            maxMessageAgeSecs: maxMessageAgeSecs,
            maxFutureDriftSecs: maxFutureDriftSecs,
            maxAmountPerMessage: maxAmountPerMessage
        });

        emit ChainPolicyUpdated(
            sourceChainId,
            enabled,
            nextVersion,
            requiredConfirmations,
            maxMessageAgeSecs,
            maxFutureDriftSecs,
            maxAmountPerMessage
        );
    }

    /// @notice Record an independently attested finalized block height for a source chain.
    /// @dev Must be strictly greater than the previously recorded finalized block to prevent
    ///      stale or reorged checkpoint rollbacks.
    function updateFinalizedSourceBlock(
        uint256 sourceChainId,
        uint64 newFinalizedBlock
    ) external onlyAttester whenNotPaused {
        if (!isChainRegistered[sourceChainId]) revert ChainDisabled(sourceChainId);
        uint64 current = finalizedSourceBlock[sourceChainId];
        if (newFinalizedBlock <= current) {
            revert NonMonotonicFinalizedBlock(current, newFinalizedBlock);
        }
        finalizedSourceBlock[sourceChainId] = newFinalizedBlock;
        emit FinalizedSourceBlockUpdated(sourceChainId, current, newFinalizedBlock, msg.sender);
    }

    // =========================================================================
    // Canonical Derivation & Digest Views
    // =========================================================================

    function getChainPolicy(uint256 sourceChainId) external view returns (ChainMetadataPolicy memory) {
        return _chainPolicies[sourceChainId];
    }

    function deriveMessageId(
        uint256 sourceChainId,
        uint256 targetChainId,
        address sender,
        uint256 nonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(sourceChainId, targetChainId, sender, nonce));
    }

    /// @notice Dynamically computes the EIP-712 domain separator using live `block.chainid`
    ///         so chain forks automatically invalidate pre-fork attestations.
    function domainSeparator(uint256 sourceChainId) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                BRIDGEWISE_DOMAIN_TYPEHASH,
                DOMAIN_NAME_HASH,
                DOMAIN_VERSION_HASH,
                sourceChainId,
                block.chainid,
                address(this)
            )
        );
    }

    function hashMetadataAttestation(
        MessageMetadata calldata meta,
        uint32 configVersion
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                METADATA_ATTESTATION_TYPEHASH,
                meta.messageId,
                meta.sourceChainId,
                meta.targetChainId,
                meta.sender,
                meta.recipient,
                meta.token,
                meta.amount,
                meta.nonce,
                meta.sourceBlockNumber,
                meta.sourceTimestamp,
                meta.deadline,
                meta.payloadHash,
                configVersion
            )
        );
    }

    function computeDigest(
        MessageMetadata calldata meta,
        uint32 configVersion
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator(meta.sourceChainId),
                hashMetadataAttestation(meta, configVersion)
            )
        );
    }

    // =========================================================================
    // Core Independent Verification
    // =========================================================================

    /// @notice View-only preflight verification of relayer-supplied metadata.
    /// @dev Reverts with the exact same error as `verifyAndConsumeMetadata` if invalid.
    function verifyMetadataView(
        MessageMetadata calldata meta,
        bytes calldata data,
        bytes calldata packedSignatures
    ) external view returns (bytes32 verifiedMessageId, uint32 configVersion) {
        return _validateMetadata(meta, data, packedSignatures);
    }

    /// @notice Independently verifies relayer-supplied message metadata and consumes the
    ///         messageId and per-sender nonce atomically.
    /// @dev Restricted to authorized executors and gated by the emergency pause circuit breaker.
    function verifyAndConsumeMetadata(
        MessageMetadata calldata meta,
        bytes calldata data,
        bytes calldata packedSignatures
    ) external onlyExecutor whenNotPaused returns (bytes32 verifiedMessageId) {
        uint32 configVersion;
        (verifiedMessageId, configVersion) = _validateMetadata(meta, data, packedSignatures);

        // Effects (CEI): consume replay key and advance monotonic per-sender nonce
        consumedMessages[verifiedMessageId] = true;
        expectedNonce[meta.sourceChainId][meta.sender] = meta.nonce + 1;
        totalVerifiedMessages += 1;
        verifiedVolumeByChain[meta.sourceChainId] += meta.amount;

        emit MetadataVerified(
            verifiedMessageId,
            meta.sourceChainId,
            meta.sender,
            meta.recipient,
            meta.token,
            meta.amount,
            meta.nonce,
            meta.sourceBlockNumber,
            configVersion,
            msg.sender
        );
    }

    // =========================================================================
    // Internal Verification Logic
    // =========================================================================

    function _validateMetadata(
        MessageMetadata calldata meta,
        bytes calldata data,
        bytes calldata packedSignatures
    ) internal view returns (bytes32 canonicalMessageId, uint32 configVersion) {
        // 1. Domain & chain checks
        if (meta.targetChainId != block.chainid) {
            revert TargetChainMismatch(block.chainid, meta.targetChainId);
        }
        if (meta.sourceChainId == 0 || meta.sourceChainId == block.chainid) {
            revert InvalidChainId();
        }

        ChainMetadataPolicy storage policy = _chainPolicies[meta.sourceChainId];
        if (!policy.enabled) revert ChainDisabled(meta.sourceChainId);
        configVersion = policy.configVersion;

        // 2. Basic field sanity & per-chain amount cap
        if (meta.sender == address(0) || meta.recipient == address(0)) revert ZeroAddress();
        if (meta.amount == 0) revert ZeroAmount();
        if (policy.maxAmountPerMessage != 0 && meta.amount > policy.maxAmountPerMessage) {
            revert AmountExceedsChainLimit(meta.amount, policy.maxAmountPerMessage);
        }

        // 3. Bounded payload & independent payloadHash verification
        if (data.length > MAX_PAYLOAD_BYTES) {
            revert PayloadTooLarge(data.length, MAX_PAYLOAD_BYTES);
        }
        bytes32 computedPayloadHash = keccak256(data);
        if (computedPayloadHash != meta.payloadHash) {
            revert PayloadHashMismatch(computedPayloadHash, meta.payloadHash);
        }

        // 4. Independent canonical messageId derivation
        canonicalMessageId = deriveMessageId(
            meta.sourceChainId,
            meta.targetChainId,
            meta.sender,
            meta.nonce
        );
        if (canonicalMessageId != meta.messageId) {
            revert MessageIdMismatch(canonicalMessageId, meta.messageId);
        }

        // 5. Persistent replay protection & strictly monotonic per-sender nonce
        if (consumedMessages[canonicalMessageId]) {
            revert MessageAlreadyConsumed(canonicalMessageId);
        }
        uint256 expected = expectedNonce[meta.sourceChainId][meta.sender];
        if (meta.nonce != expected) {
            revert InvalidNonce(expected, meta.nonce);
        }

        // 6. Deadline & source-chain clock skew bounds
        if (block.timestamp >= meta.deadline) {
            revert MessageExpired(meta.deadline, block.timestamp);
        }
        if (meta.sourceTimestamp == 0) revert ZeroSourceTimestamp();

        uint64 nowTs = uint64(block.timestamp);
        if (meta.sourceTimestamp > nowTs) {
            if (meta.sourceTimestamp - nowTs > policy.maxFutureDriftSecs) {
                revert SourceTimestampInFuture(meta.sourceTimestamp, nowTs, policy.maxFutureDriftSecs);
            }
        } else {
            if (nowTs - meta.sourceTimestamp > policy.maxMessageAgeSecs) {
                revert SourceTimestampTooOld(meta.sourceTimestamp, nowTs, policy.maxMessageAgeSecs);
            }
        }

        // 7. Independent source-chain finality / confirmation depth check
        if (meta.sourceBlockNumber == 0) revert ZeroSourceBlockNumber();
        uint64 finalizedBlock = finalizedSourceBlock[meta.sourceChainId];
        if (
            finalizedBlock < meta.sourceBlockNumber ||
            (finalizedBlock - meta.sourceBlockNumber) < policy.requiredConfirmations
        ) {
            revert SourceBlockNotFinalized(
                meta.sourceBlockNumber,
                finalizedBlock,
                policy.requiredConfirmations
            );
        }

        // 8. Independent validator quorum attestation over EIP-712 digest
        bytes32 digest = computeDigest(meta, configVersion);
        _verifyQuorumSignatures(digest, packedSignatures);
    }

    function _verifyQuorumSignatures(
        bytes32 digest,
        bytes calldata packedSignatures
    ) internal view {
        if (packedSignatures.length == 0 || packedSignatures.length % 65 != 0) {
            revert InvalidSignatureLength();
        }

        uint256 sigCount = packedSignatures.length / 65;
        if (sigCount > MAX_VALIDATORS) {
            revert TooManySignatures(sigCount, MAX_VALIDATORS);
        }

        address lastSigner = address(0);
        uint256 validCount = 0;

        for (uint256 i = 0; i < sigCount; ) {
            bytes32 r;
            bytes32 s;
            uint8 v;

            assembly {
                let offset := add(packedSignatures.offset, mul(i, 65))
                r := calldataload(offset)
                s := calldataload(add(offset, 32))
                v := byte(0, calldataload(add(offset, 64)))
            }

            if (v != 27 && v != 28) revert InvalidSignatureV(i, v);
            if (uint256(s) > SECP256K1_N_DIV_2) revert MalleableSignatureS(i);

            address signer = ecrecover(digest, v, r, s);
            if (signer == address(0)) revert InvalidRecoveredSigner(i);
            if (signer <= lastSigner) revert UnsortedOrDuplicateSigner(i);
            lastSigner = signer;

            if (isValidator[signer]) {
                unchecked {
                    ++validCount;
                }
            }

            unchecked {
                ++i;
            }
        }

        if (validCount < quorumThreshold) {
            revert QuorumNotMet(validCount, quorumThreshold);
        }
    }
}
