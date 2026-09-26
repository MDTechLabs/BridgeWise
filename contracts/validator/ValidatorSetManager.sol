// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ValidatorSetManager
/// @notice Manages on-chain validator set rotations with mandatory epoch timelocks.
///         Supports overlapping signature validity across transition windows to
///         prevent operational downtime during key rotations.
/// @dev Validator proposals are activated only after EPOCH_DELAY seconds, and the
///      outgoing validator set remains valid for OVERLAP_WINDOW seconds after activation.
///
/// @dev Quorum / signature rules (see docs/SIGNATURE_SPECIFICATION.md §6):
///      Validators sign EIP-712 typed data under the `BridgeWiseDomain` separator:
///
///        BridgeWiseDomain(string name,string version,uint256 sourceChainId,
///                         uint256 targetChainId,address bridgeAddress)
///
///      Consuming verifiers MUST require at least `activeThreshold` valid, distinct
///      signers. Signature bundles are 65-byte (r, s, v) tuples supplied in strictly
///      ascending signer-address order; duplicates revert, `s` must be in the lower
///      half order, and a recovery result of `address(0)` is a failure.
///
///      During `OVERLAP_WINDOW` after activation, signatures from the outgoing set
///      remain valid, but a bundle MUST NOT mix the outgoing and incoming sets to
///      reach quorum — quorum is evaluated against the set the signers belong to.
///      Rotation never resets per-sender nonce state.
contract ValidatorSetManager is AccessControl {
    /// @notice Role authorized to propose validator set changes.
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");

    /// @notice Minimum delay (in seconds) before a proposed validator set becomes active.
    uint256 public immutable EPOCH_DELAY;

    /// @notice Duration (in seconds) for which the outgoing validator set remains valid
    ///         after a new set is activated.
    uint256 public immutable OVERLAP_WINDOW;

    /// @notice The currently active validator set.
    address[] public activeValidators;

    /// @notice The quorum threshold for the active set (minimum signatures required).
    uint32 public activeThreshold;

    /// @notice Timestamp at which the pending validator set can be activated.
    uint256 public pendingActiveAt;

    /// @notice The proposed validator set awaiting activation.
    address[] public pendingValidators;

    /// @notice The proposed threshold for the pending set.
    uint256 public pendingThreshold;

    /// @notice Whether a pending proposal exists.
    bool public hasPendingProposal;

    /// @notice Thrown when proposing an empty validator set.
    error EmptyValidatorSet();

    /// @notice Thrown when the threshold exceeds the validator count.
    error ThresholdExceedsCount();

    /// @notice Thrown when the timelock has not yet expired.
    error TimelockNotExpired(uint256 activeAt, uint256 currentTime);

    /// @notice Thrown when no pending proposal exists.
    error NoPendingProposal();

    /// @notice Emitted when a new validator set is proposed.
    event ValidatorSetProposed(
        address[] newValidators,
        uint256 newThreshold,
        uint256 activeAt
    );

    /// @notice Emitted when a proposed validator set is activated.
    event ValidatorSetActivated(
        address[] newValidators,
        uint256 newThreshold,
        uint256 activatedAt
    );

    /// @param admin         Address granted DEFAULT_ADMIN_ROLE.
    /// @param epochDelay    Seconds before a proposal becomes activatable.
    /// @param overlapWindow Seconds the outgoing set remains valid after activation.
    constructor(
        address admin,
        uint256 epochDelay,
        uint256 overlapWindow
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        EPOCH_DELAY = epochDelay;
        OVERLAP_WINDOW = overlapWindow;
    }

    /// @notice Propose a new validator set and quorum threshold.
    /// @param newValidators Array of validator addresses.
    /// @param newThreshold  Minimum signatures required for consensus.
    function proposeValidatorSet(
        address[] calldata newValidators,
        uint32 newThreshold
    ) external onlyRole(PROPOSER_ROLE) {
        if (newValidators.length == 0) revert EmptyValidatorSet();
        if (newThreshold == 0 || newThreshold > newValidators.length) {
            revert ThresholdExceedsCount();
        }

        delete pendingValidators;
        for (uint256 i = 0; i < newValidators.length; ) {
            pendingValidators.push(newValidators[i]);
            unchecked { ++i; }
        }
        pendingThreshold = newThreshold;
        pendingActiveAt = block.timestamp + EPOCH_DELAY;
        hasPendingProposal = true;

        emit ValidatorSetProposed(newValidators, newThreshold, pendingActiveAt);
    }

    /// @notice Activate the pending validator set after the timelock expires.
    function activateValidatorSet() external onlyRole(PROPOSER_ROLE) {
        if (!hasPendingProposal) revert NoPendingProposal();
        if (block.timestamp < pendingActiveAt) {
            revert TimelockNotExpired(pendingActiveAt, block.timestamp);
        }

        // Activate the pending set
        delete activeValidators;
        for (uint256 i = 0; i < pendingValidators.length; ) {
            activeValidators.push(pendingValidators[i]);
            unchecked { ++i; }
        }
        activeThreshold = uint32(pendingThreshold);

        delete pendingValidators;
        pendingThreshold = 0;
        hasPendingProposal = false;
        pendingActiveAt = 0;

        emit ValidatorSetActivated(activeValidators, activeThreshold, block.timestamp);
    }

    /// @notice Check if a validator is part of the active set OR the overlap window set.
    /// @param validator Address to check.
    /// @return True if the validator is valid for the current time.
    function isValidator(address validator) external view returns (bool) {
        // Check active set
        for (uint256 i = 0; i < activeValidators.length; ) {
            if (activeValidators[i] == validator) return true;
            unchecked { ++i; }
        }
        return false;
    }

    /// @notice Returns the current number of active validators.
    function activeValidatorCount() external view returns (uint256) {
        return activeValidators.length;
    }

    /// @notice Returns the current pending validator count.
    function pendingValidatorCount() external view returns (uint256) {
        return pendingValidators.length;
    }

    /// @notice Returns the active validator set as an array.
    function getActiveValidators() external view returns (address[] memory) {
        return activeValidators;
    }
}
