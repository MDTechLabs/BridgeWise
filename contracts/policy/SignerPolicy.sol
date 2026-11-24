// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SignerPolicy
/// @notice Fail-closed, versioned policy gate for privileged cross-chain operations.
/// @dev A signer may only target an explicitly allowlisted (chain, destination)
///      pair and an explicitly allowlisted method selector. Every privileged
///      operation must additionally carry a fresh simulation attestation recorded
///      by the admin after a successful simulation. All chain-specific parameters
///      are set by governance in storage and are never inferred from RPC or
///      relayer supplied data. The policy performs O(1) work on every execution
///      path; bounded loops exist only in the constructor.
contract SignerPolicy {
    uint256 public constant POLICY_VERSION = 1;
    uint32 public constant MAX_ENTRIES_PER_SIGNER = 64;
    uint32 public constant MAX_CHAINS = 32;
    uint32 public constant MIN_CONFIRMATIONS = 1;
    uint32 public constant MAX_CONFIRMATIONS = 64;
    uint64 public constant MIN_SIMULATION_AGE = 5;
    uint64 public constant MAX_SIMULATION_AGE = 7 days;

    struct ChainConfig {
        bool enabled;
        uint32 requiredConfirmations;
        uint64 maxSimulationAge;
    }

    struct Simulation {
        bytes32 operationHash;
        uint64 recordedAt;
        uint64 recordedBlock;
        bool consumed;
        bool revoked;
    }

    address public admin;
    mapping(address => bool) public isExecutor;
    mapping(address => bool) public isSigner;
    mapping(address => mapping(uint32 => mapping(address => bool))) public allowedDestination;
    mapping(address => mapping(bytes4 => bool)) public allowedMethod;
    mapping(address => uint32) public destinationCount;
    mapping(address => uint32) public methodCount;
    mapping(uint32 => ChainConfig) public chainConfig;
    mapping(bytes32 => Simulation) private _simulations;
    uint256 public totalAuthorized;

    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);
    event ChainConfigUpdated(uint32 indexed chainId, bool enabled, uint32 requiredConfirmations, uint64 maxSimulationAge);
    event ExecutorUpdated(address indexed executor, bool allowed);
    event SignerUpdated(address indexed signer, bool allowed);
    event DestinationUpdated(address indexed signer, uint32 indexed chainId, address indexed destination, bool allowed);
    event MethodUpdated(address indexed signer, bytes4 indexed selector, bool allowed);
    event SimulationRecorded(
        bytes32 indexed operationId,
        bytes32 indexed operationHash,
        address indexed signer,
        uint32 chainId,
        address destination,
        bytes4 selector,
        uint64 recordedAt,
        uint64 recordedBlock
    );
    event SimulationRevoked(bytes32 indexed operationId, bytes32 indexed reason);
    event AuthorizationGranted(
        bytes32 indexed operationId,
        address indexed signer,
        uint32 indexed chainId,
        address destination,
        bytes4 selector,
        address executor
    );

    error UnauthorizedAdmin();
    error UnauthorizedExecutor();
    error ZeroAddress();
    error ZeroValue();
    error UnknownSigner();
    error ChainDisabled();
    error InvalidChainConfig();
    error TooManyChains();
    error LengthMismatch();
    error LimitReached();
    error DestinationNotAllowed();
    error MethodNotAllowed();
    error SimulationMissing();
    error SimulationStale();
    error SimulationRevokedError();
    error SimulationMismatch();
    error ConfirmationsNotMet();
    error MessageReplayed();

    constructor(address initialAdmin, uint32[] memory chainIds, ChainConfig[] memory configs) {
        if (initialAdmin == address(0)) revert ZeroAddress();
        if (chainIds.length != configs.length) revert LengthMismatch();
        if (chainIds.length > MAX_CHAINS) revert TooManyChains();
        admin = initialAdmin;
        emit AdminChanged(address(0), initialAdmin);
        for (uint256 i = 0; i < chainIds.length; i++) {
            _setChainConfig(chainIds[i], configs[i]);
        }
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert UnauthorizedAdmin();
        _;
    }

    modifier onlyExecutor() {
        if (!isExecutor[msg.sender]) revert UnauthorizedExecutor();
        _;
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminChanged(admin, newAdmin);
        admin = newAdmin;
    }

    function setChainConfig(uint32 chainId, ChainConfig calldata config) external onlyAdmin {
        _setChainConfig(chainId, config);
    }

    function _setChainConfig(uint32 chainId, ChainConfig memory config) internal {
        if (
            config.requiredConfirmations < MIN_CONFIRMATIONS ||
            config.requiredConfirmations > MAX_CONFIRMATIONS ||
            config.maxSimulationAge < MIN_SIMULATION_AGE ||
            config.maxSimulationAge > MAX_SIMULATION_AGE
        ) revert InvalidChainConfig();
        chainConfig[chainId] = config;
        emit ChainConfigUpdated(
            chainId, config.enabled, config.requiredConfirmations, config.maxSimulationAge
        );
    }

    function setExecutor(address executor, bool allowed) external onlyAdmin {
        if (executor == address(0)) revert ZeroAddress();
        if (isExecutor[executor] == allowed) return;
        isExecutor[executor] = allowed;
        emit ExecutorUpdated(executor, allowed);
    }

    function setSigner(address signer, bool allowed) external onlyAdmin {
        if (signer == address(0)) revert ZeroAddress();
        if (isSigner[signer] == allowed) return;
        isSigner[signer] = allowed;
        emit SignerUpdated(signer, allowed);
    }

    function allowDestination(address signer, uint32 chainId, address destination) external onlyAdmin {
        if (!isSigner[signer]) revert UnknownSigner();
        if (!chainConfig[chainId].enabled) revert ChainDisabled();
        if (destination == address(0)) revert ZeroAddress();
        if (allowedDestination[signer][chainId][destination]) return;
        if (destinationCount[signer] >= MAX_ENTRIES_PER_SIGNER) revert LimitReached();
        allowedDestination[signer][chainId][destination] = true;
        destinationCount[signer] += 1;
        emit DestinationUpdated(signer, chainId, destination, true);
    }

    function revokeDestination(address signer, uint32 chainId, address destination) external onlyAdmin {
        if (!allowedDestination[signer][chainId][destination]) return;
        allowedDestination[signer][chainId][destination] = false;
        destinationCount[signer] -= 1;
        emit DestinationUpdated(signer, chainId, destination, false);
    }

    function allowMethod(address signer, bytes4 selector) external onlyAdmin {
        if (!isSigner[signer]) revert UnknownSigner();
        if (selector == bytes4(0)) revert ZeroValue();
        if (allowedMethod[signer][selector]) return;
        if (methodCount[signer] >= MAX_ENTRIES_PER_SIGNER) revert LimitReached();
        allowedMethod[signer][selector] = true;
        methodCount[signer] += 1;
        emit MethodUpdated(signer, selector, true);
    }

    function revokeMethod(address signer, bytes4 selector) external onlyAdmin {
        if (!allowedMethod[signer][selector]) return;
        allowedMethod[signer][selector] = false;
        methodCount[signer] -= 1;
        emit MethodUpdated(signer, selector, false);
    }

    function operationHash(
        bytes32 operationId,
        address signer,
        uint32 chainId,
        address destination,
        bytes4 selector,
        bytes32 payloadHash
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                POLICY_VERSION, operationId, signer, chainId, destination, selector, payloadHash
            )
        );
    }

    function recordSimulation(
        bytes32 operationId,
        address signer,
        uint32 chainId,
        address destination,
        bytes4 selector,
        bytes32 payloadHash,
        uint64 observedBlock,
        uint64 observedAt,
        uint32 observedConfirmations
    ) external onlyAdmin {
        if (operationId == bytes32(0) || payloadHash == bytes32(0)) revert ZeroValue();
        if (!isSigner[signer]) revert UnknownSigner();
        ChainConfig memory config = chainConfig[chainId];
        if (!config.enabled) revert ChainDisabled();
        if (destination == address(0)) revert ZeroAddress();
        if (!allowedDestination[signer][chainId][destination]) revert DestinationNotAllowed();
        if (!allowedMethod[signer][selector]) revert MethodNotAllowed();
        if (observedBlock == 0 || observedAt == 0) revert ZeroValue();
        if (observedConfirmations < config.requiredConfirmations) revert ConfirmationsNotMet();

        Simulation storage simulation = _simulations[operationId];
        if (simulation.consumed) revert MessageReplayed();
        if (!simulation.revoked && simulation.recordedAt != 0) {
            if (block.timestamp <= simulation.recordedAt + config.maxSimulationAge) {
                revert SimulationStale();
            }
        }

        bytes32 hash = operationHash(
            operationId, signer, chainId, destination, selector, payloadHash
        );
        simulation.operationHash = hash;
        simulation.recordedAt = observedAt;
        simulation.recordedBlock = observedBlock;
        simulation.consumed = false;
        simulation.revoked = false;
        emit SimulationRecorded(
            operationId,
            hash,
            signer,
            chainId,
            destination,
            selector,
            observedAt,
            observedBlock
        );
    }

    function revokeSimulation(bytes32 operationId, bytes32 reason) external onlyAdmin {
        Simulation storage simulation = _simulations[operationId];
        if (simulation.recordedAt == 0) revert SimulationMissing();
        if (simulation.consumed) revert MessageReplayed();
        simulation.revoked = true;
        emit SimulationRevoked(operationId, reason);
    }

    function authorizeAndConsume(
        bytes32 operationId,
        address signer,
        uint32 chainId,
        address destination,
        bytes4 selector,
        bytes32 payloadHash
    ) external onlyExecutor {
        Simulation storage simulation = _simulations[operationId];
        if (simulation.recordedAt == 0) revert SimulationMissing();
        if (simulation.consumed) revert MessageReplayed();
        if (simulation.revoked) revert SimulationRevokedError();

        ChainConfig memory config = chainConfig[chainId];
        if (!config.enabled) revert ChainDisabled();
        if (block.timestamp > simulation.recordedAt + config.maxSimulationAge) {
            revert SimulationStale();
        }
        if (block.number < simulation.recordedBlock + config.requiredConfirmations) {
            revert ConfirmationsNotMet();
        }
        if (!isSigner[signer]) revert UnknownSigner();
        if (!allowedDestination[signer][chainId][destination]) revert DestinationNotAllowed();
        if (!allowedMethod[signer][selector]) revert MethodNotAllowed();

        bytes32 expected = operationHash(
            operationId, signer, chainId, destination, selector, payloadHash
        );
        if (simulation.operationHash != expected) revert SimulationMismatch();

        simulation.consumed = true;
        totalAuthorized += 1;
        emit AuthorizationGranted(
            operationId, signer, chainId, destination, selector, msg.sender
        );
    }

    function simulationFor(bytes32 operationId) external view returns (Simulation memory) {
        return _simulations[operationId];
    }

    function checkAuthorization(
        bytes32 operationId,
        address signer,
        uint32 chainId,
        address destination,
        bytes4 selector,
        bytes32 payloadHash
    ) external view returns (bool ok, uint8 reasonCode) {
        Simulation memory simulation = _simulations[operationId];
        if (simulation.recordedAt == 0) return (false, 1);
        if (simulation.consumed) return (false, 2);
        if (simulation.revoked) return (false, 3);
        ChainConfig memory config = chainConfig[chainId];
        if (!config.enabled) return (false, 4);
        if (block.timestamp > simulation.recordedAt + config.maxSimulationAge) {
            return (false, 5);
        }
        if (block.number < simulation.recordedBlock + config.requiredConfirmations) {
            return (false, 6);
        }
        if (!isSigner[signer]) return (false, 7);
        if (!allowedDestination[signer][chainId][destination]) return (false, 8);
        if (!allowedMethod[signer][selector]) return (false, 9);
        bytes32 expected = operationHash(
            operationId, signer, chainId, destination, selector, payloadHash
        );
        if (simulation.operationHash != expected) return (false, 10);
        return (true, 0);
    }
}
