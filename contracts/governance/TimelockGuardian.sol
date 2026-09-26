// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title TimelockGuardian
/// @notice Security Guardian veto contract to cancel pending timelocked contract upgrade proposals.
contract TimelockGuardian is AccessControl {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    mapping(bytes32 => bool) public isProposalCanceled;
    mapping(bytes32 => bool) public isProposalPending;

    event UpgradeCanceled(bytes32 indexed proposalId, uint256 timestamp);
    event UpgradeQueued(bytes32 indexed proposalId);

    constructor(address admin, address guardian) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, guardian);
    }

    function queueUpgrade(bytes32 proposalId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isProposalPending[proposalId] = true;
        isProposalCanceled[proposalId] = false;
        emit UpgradeQueued(proposalId);
    }

    function cancelUpgrade(bytes32 proposalId) external onlyRole(GUARDIAN_ROLE) {
        require(isProposalPending[proposalId], "Proposal not pending");
        isProposalPending[proposalId] = false;
        isProposalCanceled[proposalId] = true;
        emit UpgradeCanceled(proposalId, block.timestamp);
    }
}
