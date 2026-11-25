// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CanonicalPayloadVerifier
/// @notice Enforces maximum payload size bounds and strict canonical binary encoding
///         for cross-chain bridge messages before destination-chain execution.
/// @dev Security properties:
///      - Fail-closed per-chain versioned payload policies (`ChainPayloadPolicy`).
///      - Deterministic, unambiguous binary envelope format (`CANONICAL_ENCODING_VERSION = 1`):
///        fixed 231-byte header + exact `payloadLength` payload bytes, with zero trailing
///        bytes and no ABI offset/padding malleability.
///      - Explicit `targetChainId == block.chainid` and enabled `sourceChainId != block.chainid`.
///      - Strictly monotonic per-(sourceChainId, sender) nonce and persistent `consumedMessages`
///        replay set keyed by canonical `messageId`.
///      - EIP-712 `BridgeWiseDomain` (fork-safe) + `CanonicalPayloadAttestation` validator quorum
///        verification with EIP-2 lower-half `s` malleability protection and strictly ascending
///        signer ordering (`sigCount <= MAX_VALIDATORS`).
contract CanonicalPayloadVerifier {
    // =========================================================================
    // Constants & Versioning
    // =========================================================================

    uint256 public constant VERIFIER_VERSION = 1;
    uint8 public constant CANONICAL_ENCODING_VERSION = 1;

    /// @dev Fixed canonical header layout:
    ///      [0..1)     uint8   encodingVersion   (1 byte)
    ///      [1..3)     uint16  messageType       (2 bytes)
    ///      [3..35)    uint256 sourceChainId     (32 bytes)
    ///      [35..67)   uint256 targetChainId     (32 bytes)
    ///      [67..87)   address sender            (20 bytes)
    ///      [87..107)  address recipient         (20 bytes)
    ///      [107..127) address token             (20 bytes)
    ///      [127..159) uint256 amount            (32 bytes)
    ///      [159..191) uint256 nonce             (32 bytes)
    ///      [191..223) uint256 deadline          (32 bytes)
    ///      [223..227) uint32  configVersion     (4 bytes)
    ///      [227..231) uint32  payloadLength     (4 bytes)
    ///      Total header size = 231 bytes.
    uint256 public constant CANONICAL_HEADER_BYTES = 231;

    uint16 public constant MSG_TYPE_TRANSFER = 1;
    uint16 public constant MSG_TYPE_CONTRACT_CALL = 2;
    uint16 public constant MSG_TYPE_GOVERNANCE = 3;

    uint32 public constant MAX_CHAINS = 32;
    uint32 public constant MAX_VALIDATORS = 32;
    uint32 public constant MIN_PAYLOAD_BYTES = 1;
    uint32 public constant ABSOLUTE_MAX_PAYLOAD_BYTES = 16_384;
    uint32 public constant ABSOLUTE_MAX_ENVELOPE_BYTES =
        uint32(CANONICAL_HEADER_BYTES) + ABSOLUTE_MAX_PAYLOAD_BYTES;

    /// @dev Half of secp256k1 curve order `n` for EIP-2 signature malleability rejection.
    uint256 private constant SECP256K1_N_DIV_2 =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    bytes32 public constant DOMAIN_NAME_HASH = keccak256("BridgeWise");
    bytes32 public constant DOMAIN_VERSION_HASH = keccak256("1");

    bytes32 public constant BRIDGEWISE_DOMAIN_TYPEHASH = keccak256(
        "BridgeWiseDomain(string name,string version,uint256 sourceChainId,uint256 targetChainId,address bridgeAddress)"
    );

    bytes32 public constant CANONICAL_PAYLOAD_ATTESTATION_TYPEHASH = keccak256(
        "CanonicalPayloadAttestation(bytes32 messageId,bytes32 envelopeHash,uint8 encodingVersion,uint16 messageType,uint256 sourceChainId,uint256 targetChainId,uint32 configVersion,uint32 payloadLength)"
    );

    // =========================================================================
    // Types
    // =========================================================================

    struct ChainPayloadPolicy {
        bool enabled;
        uint32 configVersion;
        uint32 maxPayloadBytes;
        bool allowEmptyPayload;
        uint256 maxAmountPerMessage;
    }

    struct CanonicalMessage {
        uint8 encodingVersion;
        uint16 messageType;
        uint256 sourceChainId;
        uint256 targetChainId;
        address sender;
        address recipient;
        address token;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
        uint32 configVersion;
        bytes payload;
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

    uint32 public configuredChainCount;
    mapping(uint256 => bool) public isChainRegistered;
    mapping(uint256 => ChainPayloadPolicy) private _chainPolicies;

    /// @notice Persistent replay protection keyed by canonical `messageId`.
    mapping(bytes32 => bool) public consumedMessages;

    /// @notice Strictly monotonic per-(sourceChainId, sender) expected nonce.
    mapping(uint256 => mapping(address => uint256)) public expectedNonce;

    /// @notice Accounting counters for invariant verification and monitoring.
    uint256 public totalVerifiedMessages;
    uint256 public totalVerifiedPayloadBytes;
    mapping(uint256 => uint256) public verifiedVolumeByChain;

    // =========================================================================
    // Events
    // =========================================================================

    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event PausedStateChanged(bool paused, address indexed actor);
    event ExecutorUpdated(address indexed executor, bool allowed);
    event ValidatorUpdated(address indexed validator, bool active, uint32 newValidatorCount);
    event QuorumThresholdUpdated(uint32 previousThreshold, uint32 newThreshold);
    event ChainPayloadPolicyUpdated(
        uint256 indexed sourceChainId,
        bool enabled,
        uint32 configVersion,
        uint32 maxPayloadBytes,
        bool allowEmptyPayload,
        uint256 maxAmountPerMessage
    );
    event CanonicalEnvelopeVerified(
        bytes32 indexed messageId,
        bytes32 indexed envelopeHash,
        uint256 indexed sourceChainId,
        uint16 messageType,
        address sender,
        address recipient,
        address token,
        uint256 amount,
        uint256 nonce,
        uint32 payloadLength,
        uint32 configVersion
    );

    // =========================================================================
    // Errors
    // =========================================================================

    error Unauthorized();
    error ZeroAddress();
    error ContractPaused();
    error InvalidChainId(uint256 chainId);
    error SameChainMessage(uint256 chainId);
    error TargetChainMismatch(uint256 expected, uint256 actual);
    error ChainDisabled(uint256 sourceChainId);
    error MaxChainsExceeded(uint32 maxChains);
    error MaxValidatorsExceeded(uint32 maxValidators);
    error InvalidQuorumThreshold(uint32 threshold, uint32 validatorCount);
    error InvalidPolicyBounds();
    error EnvelopeTooShort(uint256 actual, uint256 minimum);
    error EnvelopeTooLarge(uint256 actual, uint256 maximum);
    error UnsupportedEncodingVersion(uint8 version);
    error UnsupportedMessageType(uint16 messageType);
    error PayloadLengthMismatch(uint256 declared, uint256 actual);
    error PayloadTooLarge(uint256 actual, uint256 maximum);
    error EmptyPayloadNotAllowed(uint256 sourceChainId);
    error ConfigVersionMismatch(uint32 expected, uint32 actual);
    error InvalidAmount(uint256 amount, uint256 maxAmount);
    error MessageExpired(uint256 deadline, uint256 currentTimestamp);
    error MessageAlreadyConsumed(bytes32 messageId);
    error InvalidNonce(uint256 expected, uint256 actual);
    error InvalidSignatureLength(uint256 length);
    error InsufficientQuorum(uint256 validCount, uint32 required);
    error InvalidSignatureV(uint8 v);
    error MalleableSignatureS(bytes32 s);
    error InvalidValidatorSignature(address recovered);
    error NonAscendingSigners(address previous, address current);

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyGuardianOrAdmin() {
        if (msg.sender != guardian && msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyExecutor() {
        if (!isExecutor[msg.sender]) revert Unauthorized();
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
        address _admin,
        address _guardian,
        address[] memory _initialValidators,
        uint32 _quorumThreshold
    ) {
        if (_admin == address(0) || _guardian == address(0)) revert ZeroAddress();
        if (_initialValidators.length == 0 || _initialValidators.length > MAX_VALIDATORS) {
            revert MaxValidatorsExceeded(MAX_VALIDATORS);
        }

        admin = _admin;
        guardian = _guardian;

        uint32 count = 0;
        for (uint256 i = 0; i < _initialValidators.length; i++) {
            address val = _initialValidators[i];
            if (val == address(0)) revert ZeroAddress();
            if (!isValidator[val]) {
                isValidator[val] = true;
                count++;
                emit ValidatorUpdated(val, true, count);
            }
        }
        validatorCount = count;

        if (_quorumThreshold == 0 || _quorumThreshold > count) {
            revert InvalidQuorumThreshold(_quorumThreshold, count);
        }
        quorumThreshold = _quorumThreshold;
        emit QuorumThresholdUpdated(0, _quorumThreshold);
    }

    // =========================================================================
    // Governance & Emergency Controls
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

    function setValidator(address validator, bool active) external onlyAdmin {
        if (validator == address(0)) revert ZeroAddress();
        bool currently = isValidator[validator];
        if (currently == active) return;

        if (active) {
            if (validatorCount >= MAX_VALIDATORS) revert MaxValidatorsExceeded(MAX_VALIDATORS);
            isValidator[validator] = true;
            validatorCount += 1;
        } else {
            if (validatorCount - 1 < quorumThreshold) {
                revert InvalidQuorumThreshold(quorumThreshold, validatorCount - 1);
            }
            isValidator[validator] = false;
            validatorCount -= 1;
        }
        emit ValidatorUpdated(validator, active, validatorCount);
    }

    function setQuorumThreshold(uint32 newThreshold) external onlyAdmin {
        if (newThreshold == 0 || newThreshold > validatorCount) {
            revert InvalidQuorumThreshold(newThreshold, validatorCount);
        }
        uint32 prev = quorumThreshold;
        quorumThreshold = newThreshold;
        emit QuorumThresholdUpdated(prev, newThreshold);
    }

    /// @notice Explicitly registers or updates a versioned payload policy for `sourceChainId`.
    /// @dev Increments `configVersion` on every update so stale pre-incident attestations fail closed.
    function setChainPayloadPolicy(
        uint256 sourceChainId,
        bool enabled,
        uint32 maxPayloadBytes,
        bool allowEmptyPayload,
        uint256 maxAmountPerMessage
    ) external onlyAdmin {
        if (sourceChainId == 0) revert InvalidChainId(sourceChainId);
        if (sourceChainId == block.chainid) revert SameChainMessage(sourceChainId);
        if (
            maxPayloadBytes < MIN_PAYLOAD_BYTES ||
            maxPayloadBytes > ABSOLUTE_MAX_PAYLOAD_BYTES ||
            maxAmountPerMessage == 0
        ) {
            revert InvalidPolicyBounds();
        }

        if (!isChainRegistered[sourceChainId]) {
            if (configuredChainCount >= MAX_CHAINS) revert MaxChainsExceeded(MAX_CHAINS);
            isChainRegistered[sourceChainId] = true;
            configuredChainCount += 1;
        }

        ChainPayloadPolicy storage policy = _chainPolicies[sourceChainId];
        uint32 nextVersion = policy.configVersion + 1;

        policy.enabled = enabled;
        policy.configVersion = nextVersion;
        policy.maxPayloadBytes = maxPayloadBytes;
        policy.allowEmptyPayload = allowEmptyPayload;
        policy.maxAmountPerMessage = maxAmountPerMessage;

        emit ChainPayloadPolicyUpdated(
            sourceChainId,
            enabled,
            nextVersion,
            maxPayloadBytes,
            allowEmptyPayload,
            maxAmountPerMessage
        );
    }

    function getChainPayloadPolicy(uint256 sourceChainId)
        external
        view
        returns (ChainPayloadPolicy memory)
    {
        return _chainPolicies[sourceChainId];
    }

    // =========================================================================
    // Canonical Encoding & Strict Decoding
    // =========================================================================

    /// @notice Deterministically encodes a `CanonicalMessage` into its canonical binary envelope.
    function encodeCanonicalEnvelope(CanonicalMessage memory m)
        public
        pure
        returns (bytes memory envelope)
    {
        if (m.encodingVersion != CANONICAL_ENCODING_VERSION) {
            revert UnsupportedEncodingVersion(m.encodingVersion);
        }
        if (!_isSupportedMessageType(m.messageType)) {
            revert UnsupportedMessageType(m.messageType);
        }
        if (m.sourceChainId == 0) revert InvalidChainId(m.sourceChainId);
        if (m.targetChainId == 0) revert InvalidChainId(m.targetChainId);
        if (m.sourceChainId == m.targetChainId) revert SameChainMessage(m.sourceChainId);
        if (m.sender == address(0) || m.recipient == address(0) || m.token == address(0)) {
            revert ZeroAddress();
        }
        if (m.payload.length > ABSOLUTE_MAX_PAYLOAD_BYTES) {
            revert PayloadTooLarge(m.payload.length, ABSOLUTE_MAX_PAYLOAD_BYTES);
        }

        uint32 payloadLen = uint32(m.payload.length);
        envelope = abi.encodePacked(
            m.encodingVersion,
            m.messageType,
            m.sourceChainId,
            m.targetChainId,
            m.sender,
            m.recipient,
            m.token,
            m.amount,
            m.nonce,
            m.deadline,
            m.configVersion,
            payloadLen,
            m.payload
        );
    }

    /// @notice Strictly decodes a canonical binary envelope, rejecting any truncated,
    ///         oversized, or non-canonical input (including trailing garbage bytes).
    function decodeCanonicalEnvelope(bytes calldata envelope)
        public
        pure
        returns (CanonicalMessage memory m)
    {
        uint256 len = envelope.length;
        if (len < CANONICAL_HEADER_BYTES) {
            revert EnvelopeTooShort(len, CANONICAL_HEADER_BYTES);
        }
        if (len > ABSOLUTE_MAX_ENVELOPE_BYTES) {
            revert EnvelopeTooLarge(len, ABSOLUTE_MAX_ENVELOPE_BYTES);
        }

        uint8 encodingVersion = uint8(bytes1(envelope[0:1]));
        if (encodingVersion != CANONICAL_ENCODING_VERSION) {
            revert UnsupportedEncodingVersion(encodingVersion);
        }

        uint16 messageType = uint16(bytes2(envelope[1:3]));
        if (!_isSupportedMessageType(messageType)) {
            revert UnsupportedMessageType(messageType);
        }

        uint256 sourceChainId = uint256(bytes32(envelope[3:35]));
        uint256 targetChainId = uint256(bytes32(envelope[35:67]));
        if (sourceChainId == 0) revert InvalidChainId(sourceChainId);
        if (targetChainId == 0) revert InvalidChainId(targetChainId);
        if (sourceChainId == targetChainId) revert SameChainMessage(sourceChainId);

        address sender = address(bytes20(envelope[67:87]));
        address recipient = address(bytes20(envelope[87:107]));
        address token = address(bytes20(envelope[107:127]));
        if (sender == address(0) || recipient == address(0) || token == address(0)) {
            revert ZeroAddress();
        }

        uint256 amount = uint256(bytes32(envelope[127:159]));
        uint256 nonce = uint256(bytes32(envelope[159:191]));
        uint256 deadline = uint256(bytes32(envelope[191:223]));
        uint32 configVersion = uint32(bytes4(envelope[223:227]));
        uint32 declaredPayloadLen = uint32(bytes4(envelope[227:231]));

        uint256 actualPayloadLen = len - CANONICAL_HEADER_BYTES;
        if (declaredPayloadLen != actualPayloadLen) {
            revert PayloadLengthMismatch(declaredPayloadLen, actualPayloadLen);
        }
        if (declaredPayloadLen > ABSOLUTE_MAX_PAYLOAD_BYTES) {
            revert PayloadTooLarge(declaredPayloadLen, ABSOLUTE_MAX_PAYLOAD_BYTES);
        }

        m = CanonicalMessage({
            encodingVersion: encodingVersion,
            messageType: messageType,
            sourceChainId: sourceChainId,
            targetChainId: targetChainId,
            sender: sender,
            recipient: recipient,
            token: token,
            amount: amount,
            nonce: nonce,
            deadline: deadline,
            configVersion: configVersion,
            payload: envelope[CANONICAL_HEADER_BYTES:]
        });
    }

    /// @notice Verifies that `envelope` decodes cleanly and round-trips bit-for-bit identically.
    function isCanonicalEncoding(bytes calldata envelope) external pure returns (bool) {
        CanonicalMessage memory m = decodeCanonicalEnvelope(envelope);
        bytes memory reencoded = encodeCanonicalEnvelope(m);
        return keccak256(reencoded) == keccak256(envelope);
    }

    /// @notice Computes the canonical `messageId` for a decoded message.
    function computeCanonicalMessageId(CanonicalMessage memory m)
        public
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                m.encodingVersion,
                m.messageType,
                m.sourceChainId,
                m.targetChainId,
                m.sender,
                m.nonce
            )
        );
    }

    // =========================================================================
    // EIP-712 Domain & Attestation Digests
    // =========================================================================

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

    function hashAttestation(
        bytes32 messageId,
        bytes32 envelopeHash,
        uint8 encodingVersion,
        uint16 messageType,
        uint256 sourceChainId,
        uint256 targetChainId,
        uint32 configVersion,
        uint32 payloadLength
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                CANONICAL_PAYLOAD_ATTESTATION_TYPEHASH,
                messageId,
                envelopeHash,
                encodingVersion,
                messageType,
                sourceChainId,
                targetChainId,
                configVersion,
                payloadLength
            )
        );
    }

    function computeAttestationDigest(bytes calldata envelope)
        public
        view
        returns (bytes32 digest, bytes32 messageId, bytes32 envelopeHash)
    {
        CanonicalMessage memory m = decodeCanonicalEnvelope(envelope);
        messageId = computeCanonicalMessageId(m);
        envelopeHash = keccak256(envelope);
        bytes32 structHash = hashAttestation(
            messageId,
            envelopeHash,
            m.encodingVersion,
            m.messageType,
            m.sourceChainId,
            m.targetChainId,
            m.configVersion,
            uint32(m.payload.length)
        );
        digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(m.sourceChainId), structHash));
    }

    // =========================================================================
    // Core Verification & Consumption
    // =========================================================================

    /// @notice Verifies canonical encoding, payload size bounds, chain policy, replay protection,
    ///         and validator quorum signatures, then consumes the message nonce and ID.
    /// @dev Callable only by authorized executors (`isExecutor[msg.sender]`).
    function verifyAndConsumeCanonicalEnvelope(
        bytes calldata envelope,
        bytes calldata packedSignatures
    )
        external
        onlyExecutor
        whenNotPaused
        returns (CanonicalMessage memory m, bytes32 messageId, bytes32 envelopeHash)
    {
        // 1. Strict canonical decoding (checks header length, version, type, non-zero addresses, exact payloadLength)
        m = decodeCanonicalEnvelope(envelope);

        // 2. Chain boundary and explicit per-chain policy enforcement
        if (m.targetChainId != block.chainid) {
            revert TargetChainMismatch(block.chainid, m.targetChainId);
        }

        ChainPayloadPolicy memory policy = _chainPolicies[m.sourceChainId];
        if (!policy.enabled) {
            revert ChainDisabled(m.sourceChainId);
        }
        if (m.configVersion != policy.configVersion) {
            revert ConfigVersionMismatch(policy.configVersion, m.configVersion);
        }

        // 3. Per-chain payload size & empty-payload enforcement
        uint256 payloadLen = m.payload.length;
        if (payloadLen == 0 && !policy.allowEmptyPayload) {
            revert EmptyPayloadNotAllowed(m.sourceChainId);
        }
        if (payloadLen > policy.maxPayloadBytes) {
            revert PayloadTooLarge(payloadLen, policy.maxPayloadBytes);
        }

        // 4. Value & liveness bounds
        if (m.amount == 0 || m.amount > policy.maxAmountPerMessage) {
            revert InvalidAmount(m.amount, policy.maxAmountPerMessage);
        }
        if (m.deadline <= block.timestamp) {
            revert MessageExpired(m.deadline, block.timestamp);
        }

        // 5. Replay protection & strict monotonic nonce
        messageId = computeCanonicalMessageId(m);
        if (consumedMessages[messageId]) {
            revert MessageAlreadyConsumed(messageId);
        }
        uint256 expNonce = expectedNonce[m.sourceChainId][m.sender];
        if (m.nonce != expNonce) {
            revert InvalidNonce(expNonce, m.nonce);
        }

        // 6. Validator quorum signature verification over canonical envelope hash
        envelopeHash = keccak256(envelope);
        bytes32 structHash = hashAttestation(
            messageId,
            envelopeHash,
            m.encodingVersion,
            m.messageType,
            m.sourceChainId,
            m.targetChainId,
            m.configVersion,
            uint32(payloadLen)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator(m.sourceChainId), structHash)
        );
        _verifyValidatorQuorum(digest, packedSignatures);

        // 7. Commit state transitions
        consumedMessages[messageId] = true;
        expectedNonce[m.sourceChainId][m.sender] = expNonce + 1;
        totalVerifiedMessages += 1;
        totalVerifiedPayloadBytes += payloadLen;
        verifiedVolumeByChain[m.sourceChainId] += m.amount;

        emit CanonicalEnvelopeVerified(
            messageId,
            envelopeHash,
            m.sourceChainId,
            m.messageType,
            m.sender,
            m.recipient,
            m.token,
            m.amount,
            m.nonce,
            uint32(payloadLen),
            m.configVersion
        );
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    function _isSupportedMessageType(uint16 messageType) internal pure returns (bool) {
        return
            messageType == MSG_TYPE_TRANSFER ||
            messageType == MSG_TYPE_CONTRACT_CALL ||
            messageType == MSG_TYPE_GOVERNANCE;
    }

    function _verifyValidatorQuorum(bytes32 digest, bytes calldata packedSignatures) internal view {
        uint256 sigBytes = packedSignatures.length;
        if (sigBytes == 0 || sigBytes % 65 != 0) {
            revert InvalidSignatureLength(sigBytes);
        }

        uint256 sigCount = sigBytes / 65;
        if (sigCount > MAX_VALIDATORS) {
            revert MaxValidatorsExceeded(MAX_VALIDATORS);
        }
        if (sigCount < quorumThreshold) {
            revert InsufficientQuorum(sigCount, quorumThreshold);
        }

        address lastSigner = address(0);
        for (uint256 i = 0; i < sigCount; i++) {
            uint256 offset = i * 65;
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := calldataload(add(packedSignatures.offset, offset))
                s := calldataload(add(packedSignatures.offset, add(offset, 32)))
                v := byte(0, calldataload(add(packedSignatures.offset, add(offset, 64))))
            }

            if (v != 27 && v != 28) revert InvalidSignatureV(v);
            if (uint256(s) > SECP256K1_N_DIV_2) revert MalleableSignatureS(s);

            address recovered = ecrecover(digest, v, r, s);
            if (recovered == address(0) || !isValidator[recovered]) {
                revert InvalidValidatorSignature(recovered);
            }
            if (recovered <= lastSigner) {
                revert NonAscendingSigners(lastSigner, recovered);
            }
            lastSigner = recovered;
        }
    }
}
