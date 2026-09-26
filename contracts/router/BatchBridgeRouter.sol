// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title IBridgeVault
/// @notice Minimal interface for the core bridge vault used by routers.
interface IBridgeVault {
    function lock(
        uint32 destinationChainId,
        address token,
        uint256 amount,
        bytes32 recipient
    ) external;
}

/// @title BatchBridgeRouter
/// @notice Allows users to bridge multiple distinct token types to one or more
///         destination chains in a single atomic transaction.
contract BatchBridgeRouter {
    using SafeERC20 for IERC20;

    /// @notice Emitted once per batch with an aggregated payload describing all
    ///         individual bridge operations.
    event BatchBridgeDispatched(
        address indexed sender,
        uint256 count,
        uint256 totalAmount,
        bytes payload
    );

    /// @notice Core bridge vault that receives token deposits.
    IBridgeVault public immutable vault;

    error LengthMismatch();
    error EmptyBatch();

    constructor(address _vault) {
        require(_vault != address(0), "BatchBridgeRouter: zero vault");
        vault = IBridgeVault(_vault);
    }

    /// @notice Deposit multiple tokens into the bridge vault in one transaction.
    /// @param tokens              ERC-20 tokens to bridge.
    /// @param amounts             Amounts to bridge for each token.
    /// @param destinationChainIds Destination chain for each token.
    /// @param recipients          32-byte normalized recipients for each token.
    /// @dev The entire batch reverts if any individual `safeTransferFrom` or
    ///      `lock` call fails, preserving atomicity.
    function batchDeposit(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint32[] calldata destinationChainIds,
        bytes32[] calldata recipients
    ) external {
        uint256 count = tokens.length;
        if (count == 0) revert EmptyBatch();
        if (
            amounts.length != count ||
            destinationChainIds.length != count ||
            recipients.length != count
        ) revert LengthMismatch();

        uint256 totalAmount = 0;

        for (uint256 i = 0; i < count; i++) {
            address token = tokens[i];
            uint256 amount = amounts[i];

            // Pull tokens from the caller and forward directly to the vault.
            // SafeERC20 reverts automatically on transfer failures.
            IERC20(token).safeTransferFrom(msg.sender, address(vault), amount);
            vault.lock(destinationChainIds[i], token, amount, recipients[i]);

            totalAmount += amount;
        }

        bytes memory payload = abi.encode(tokens, amounts, destinationChainIds, recipients);
        emit BatchBridgeDispatched(msg.sender, count, totalAmount, payload);
    }
}
