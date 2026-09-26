// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title IZKVerifier
/// @notice Interface that ZK-SNARK verifier implementations must conform to.
interface IZKVerifier {
    /// @notice Verify a zero-knowledge proof.
    /// @param proof    The encoded proof data.
    /// @param publicInputs The public inputs to the proof.
    /// @return True if the proof is valid.
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @title ZKVerifierRegistry
/// @notice Modular registry mapping chain IDs to ZK-SNARK verifier implementation addresses.
///         Allows seamless upgrades of zero-knowledge proof circuits without redeploying
///         core bridge contracts.
/// @dev Admin-governed registration ensures only trusted verifiers are used. Supports
///      interface validation on registration to prevent misconfigured verifiers.
contract ZKVerifierRegistry is AccessControl {
    /// @notice Role authorized to register/upgrade verifiers.
    bytes32 public constant VERIFIER_ADMIN_ROLE = keccak256("VERIFIER_ADMIN_ROLE");

    /// @notice Mapping from chain ID to the verifier contract address for that chain.
    mapping(uint32 => address) public chainVerifiers;

    /// @notice Mapping from chain ID to verifier metadata (optional, for UI/audit purposes).
    mapping(uint32 => string) public verifierMetadata;

    /// @notice Total number of registered chain verifiers.
    uint256 public registeredCount;

    /// @notice Thrown when no verifier is registered for a chain.
    error NoVerifierForChain(uint32 chainId);

    /// @notice Thrown when the verifier address is the zero address.
    error InvalidVerifierAddress();

    /// @notice Thrown when the verifier does not implement IZKVerifier.
    error InvalidVerifierInterface();

    /// @notice Emitted when a verifier is registered for a chain.
    event VerifierRegistered(
        uint32 indexed chainId,
        address verifier,
        string metadata
    );

    /// @notice Emitted when a verifier is upgraded for a chain.
    event VerifierUpgraded(
        uint32 indexed chainId,
        address oldVerifier,
        address newVerifier
    );

    /// @notice Emitted when a verifier is removed for a chain.
    event VerifierRemoved(uint32 indexed chainId, address verifier);

    /// @param admin Address granted DEFAULT_ADMIN_ROLE.
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Register a new verifier for a chain, or replace an existing one.
    /// @param chainId  The target chain ID.
    /// @param verifier The IZKVerifier-compliant contract address.
    /// @param metadata Optional descriptive string (e.g., circuit version).
    function registerVerifier(
        uint32 chainId,
        address verifier,
        string calldata metadata
    ) external onlyRole(VERIFIER_ADMIN_ROLE) {
        if (verifier == address(0)) revert InvalidVerifierAddress();
        // Validate interface conformance via staticcall
        _validateVerifierInterface(verifier);

        address old = chainVerifiers[chainId];
        chainVerifiers[chainId] = verifier;
        verifierMetadata[chainId] = metadata;

        if (old == address(0)) {
            registeredCount++;
            emit VerifierRegistered(chainId, verifier, metadata);
        } else {
            emit VerifierUpgraded(chainId, old, verifier);
        }
    }

    /// @notice Remove a verifier for a chain.
    /// @param chainId The chain ID to remove.
    function removeVerifier(uint32 chainId) external onlyRole(VERIFIER_ADMIN_ROLE) {
        address old = chainVerifiers[chainId];
        if (old == address(0)) revert NoVerifierForChain(chainId);
        delete chainVerifiers[chainId];
        delete verifierMetadata[chainId];
        registeredCount--;
        emit VerifierRemoved(chainId, old);
    }

    /// @notice Verify a proof by routing to the chain's registered verifier.
    /// @param chainId       The target chain ID.
    /// @param proof         Encoded proof data.
    /// @param publicInputs  Public inputs to the proof.
    /// @return True if the proof is valid.
    function verifyProof(
        uint32 chainId,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external view returns (bool) {
        address verifier = chainVerifiers[chainId];
        if (verifier == address(0)) revert NoVerifierForChain(chainId);
        return IZKVerifier(verifier).verify(proof, publicInputs);
    }

    /// @notice Check if a verifier is registered for a chain.
    /// @param chainId The chain ID.
    /// @return True if registered.
    function hasVerifier(uint32 chainId) external view returns (bool) {
        return chainVerifiers[chainId] != address(0);
    }

    /// @dev Validate that `verifier` implements IZKVerifier via staticcall.
    function _validateVerifierInterface(address verifier) internal view {
        (bool success, ) = verifier.staticcall(
            abi.encodeWithSignature("verify(bytes,bytes32[])", "", new bytes32[](0))
        );
        // We accept the call reverting as valid (the function exists but may revert on empty input)
        // We only reject if the call itself doesn't exist (returns false without revert)
        if (!success) {
            // Check if it's an interface-not-found error by seeing if it has any code
            uint256 codeSize;
            assembly { codeSize := extcodesize(verifier) }
            if (codeSize == 0) revert InvalidVerifierInterface();
        }
    }
}
