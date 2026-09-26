// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title GasRefundVault
/// @notice Automated gas refund distribution engine that reimburses relayer addresses
///         for actual gas consumed when executing destination-chain state transactions.
/// @dev Tracks gas usage with gasleft() before and after execution, calculates refund
///      amount with overhead, and enforces ceiling bounds to prevent over-reimbursement.
contract GasRefundVault is AccessControl, Pausable {
    /// @notice Role permitted to execute relayer transactions and claim gas refunds.
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /// @notice Role permitted to pause/unpause the contract (guardian).
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /// @notice Fixed overhead gas units added to consumed gas for refund calculation.
    uint256 public immutable overhead;

    /// @notice Maximum refund amount per transaction to prevent over-reimbursement attacks.
    uint256 public maxRefundPerTx;

    /// @notice Total gas refunded to relayers (for accounting).
    uint256 public totalGasRefunded;

    /// @notice Total native tokens disbursed as refunds (for accounting).
    uint256 public totalNativeDisbursed;

    /// @notice Gas refunded per relayer address.
    mapping(address => uint256) public gasRefundedByRelayer;

    /// @notice Native tokens disbursed per relayer address.
    mapping(address => uint256) public nativeDisbursedByRelayer;

    /// @notice Thrown when the caller is not an authorized relayer.
    error UnauthorizedRelayer();

    /// @notice Thrown when refund amount exceeds maximum allowed.
    error RefundExceedsMaximum();

    /// @notice Thrown when contract has insufficient balance for refund.
    error InsufficientBalance();

    /// @notice Emitted when a relayer is successfully refunded for gas.
    event GasRefunded(
        address indexed relayer,
        uint256 gasUsed,
        uint256 gasPrice,
        uint256 refundAmount
    );

    /// @notice Emitted when the maximum refund per transaction is updated.
    event MaxRefundUpdated(uint256 oldMax, uint256 newMax);

    /// @notice Emitted when the vault receives native tokens.
    event VaultDeposited(address indexed from, uint256 amount);

    /// @param admin              Initial admin with DEFAULT_ADMIN_ROLE.
    /// @param guardian           Guardian address with GUARDIAN_ROLE.
    /// @param initialRelayer     Initial relayer address with RELAYER_ROLE.
    /// @param _overhead          Fixed overhead gas units for refund calculation.
    /// @param _maxRefundPerTx    Maximum refund amount per transaction.
    constructor(
        address admin,
        address guardian,
        address initialRelayer,
        uint256 _overhead,
        uint256 _maxRefundPerTx
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, guardian);
        _grantRole(RELAYER_ROLE, initialRelayer);
        overhead = _overhead;
        maxRefundPerTx = _maxRefundPerTx;
    }

    /// @notice Receive native tokens to fund the refund vault.
    receive() external payable {
        emit VaultDeposited(msg.sender, msg.value);
    }

    /// @notice Execute a target call and refund the relayer for gas consumed.
    /// @dev Tracks gas before and after execution, calculates refund, and transfers
    ///      native tokens to msg.sender (the relayer). Only callable by RELAYER_ROLE.
    /// @param target  The target contract to call.
    /// @param data    The calldata to send to the target.
    /// @return success Whether the target call succeeded.
    /// @return returnData The return data from the target call.
    /// @return gasUsed The total gas consumed including overhead.
    /// @return refundAmount The native token amount refunded to the relayer.
    function executeWithGasRefund(
        address target,
        bytes calldata data
    )
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
        returns (
            bool success,
            bytes memory returnData,
            uint256 gasUsed,
            uint256 refundAmount
        )
    {
        uint256 gasStart = gasleft();

        // Execute the target call
        (success, returnData) = target.call(data);

        uint256 gasEnd = gasleft();
        uint256 gasConsumed = (gasStart > gasEnd) ? (gasStart - gasEnd) : 0;
        gasUsed = gasConsumed + overhead;

        // Calculate refund amount: gasUsed * tx.gasprice
        refundAmount = gasUsed * tx.gasprice;

        // Enforce maximum refund ceiling
        if (refundAmount > maxRefundPerTx) {
            refundAmount = maxRefundPerTx;
        }

        // Ensure sufficient balance
        if (address(this).balance < refundAmount) {
            revert InsufficientBalance();
        }

        // Transfer refund to relayer (msg.sender)
        if (refundAmount > 0) {
            (bool transferSuccess, ) = msg.sender.call{value: refundAmount}("");
            require(transferSuccess, "Refund transfer failed");
        }

        // Update accounting
        totalGasRefunded += gasUsed;
        totalNativeDisbursed += refundAmount;
        gasRefundedByRelayer[msg.sender] += gasUsed;
        nativeDisbursedByRelayer[msg.sender] += refundAmount;

        emit GasRefunded(msg.sender, gasUsed, tx.gasprice, refundAmount);
    }

    /// @notice Claim gas refund for a manually reported gas usage.
    /// @dev Allows relayers to claim refunds for gas consumed in external calls.
    ///      Enforces ceiling bounds and requires sufficient vault balance.
    /// @param gasUsed The gas consumed (including overhead).
    /// @param gasPrice The gas price at time of execution.
    /// @return refundAmount The native token amount refunded.
    function claimGasRefund(
        uint256 gasUsed,
        uint256 gasPrice
    ) external onlyRole(RELAYER_ROLE) whenNotPaused returns (uint256 refundAmount) {
        refundAmount = gasUsed * gasPrice;

        // Enforce maximum refund ceiling
        if (refundAmount > maxRefundPerTx) {
            refundAmount = maxRefundPerTx;
        }

        // Ensure sufficient balance
        if (address(this).balance < refundAmount) {
            revert InsufficientBalance();
        }

        // Transfer refund to relayer
        if (refundAmount > 0) {
            (bool transferSuccess, ) = msg.sender.call{value: refundAmount}("");
            require(transferSuccess, "Refund transfer failed");
        }

        // Update accounting
        totalGasRefunded += gasUsed;
        totalNativeDisbursed += refundAmount;
        gasRefundedByRelayer[msg.sender] += gasUsed;
        nativeDisbursedByRelayer[msg.sender] += refundAmount;

        emit GasRefunded(msg.sender, gasUsed, gasPrice, refundAmount);
    }

    /// @notice Update the maximum refund amount per transaction.
    /// @dev Only callable by DEFAULT_ADMIN_ROLE.
    /// @param _maxRefundPerTx New maximum refund amount.
    function setMaxRefundPerTx(uint256 _maxRefundPerTx) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldMax = maxRefundPerTx;
        maxRefundPerTx = _maxRefundPerTx;
        emit MaxRefundUpdated(oldMax, _maxRefundPerTx);
    }

    /// @notice Pause the contract to halt refund operations.
    /// @dev Only callable by GUARDIAN_ROLE.
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    /// @notice Unpause the contract to resume refund operations.
    /// @dev Only callable by GUARDIAN_ROLE.
    function unpause() external onlyRole(GUARDIAN_ROLE) {
        _unpause();
    }

    /// @notice Get the current vault balance.
    /// @return The native token balance of the contract.
    function getVaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Get refund statistics for a specific relayer.
    /// @param relayer The relayer address.
    /// @return gasRefunded Total gas refunded to the relayer.
    /// @return nativeDisbursed Total native tokens disbursed to the relayer.
    function getRelayerStats(
        address relayer
    ) external view returns (uint256 gasRefunded, uint256 nativeDisbursed) {
        return (
            gasRefundedByRelayer[relayer],
            nativeDisbursedByRelayer[relayer]
        );
    }
}