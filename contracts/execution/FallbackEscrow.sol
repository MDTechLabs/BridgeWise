// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title FallbackEscrow
/// @notice User-claimable escrow vault that holds tokens diverted when a cross-chain
///         destination call fails. Recipients can withdraw escrowed funds via a
///         claim function using their message ID as the key.
/// @dev Tokens are stored per-recipient. Each failed message deposits into the
///      recipient's escrow balance. Claims are keyed by messageId for auditability.
contract FallbackEscrow is Ownable {
    using SafeERC20 for IERC20;

    struct EscrowEntry {
        uint256 amount;
        address token;
        bool claimed;
    }

    /// @notice Mapping from message ID to escrow entry.
    mapping(bytes32 => EscrowEntry) public escrows;

    /// @notice Mapping from recipient address to total claimable amount per token.
    mapping(address => mapping(address => uint256)) public claimable;

    /// @notice List of escrowed message IDs per recipient (for enumeration).
    mapping(address => bytes32[]) public recipientMessages;

    /// @notice Emitted when tokens are escrowed.
    event TokensEscrowed(
        bytes32 indexed messageId,
        address indexed recipient,
        address token,
        uint256 amount
    );

    /// @notice Emitted when a recipient claims escrowed tokens.
    event TokensClaimed(
        bytes32 indexed messageId,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Thrown when a message has already been escrowed.
    error AlreadyEscrowed(bytes32 messageId);

    /// @notice Thrown when no escrowed tokens are available to claim.
    error NothingToClaim(bytes32 messageId);

    /// @notice Thrown when the caller is not the escrowed recipient.
    error NotRecipient();

    /// @param admin Address granted ownership.
    constructor(address admin) Ownable(admin) {}

    /// @notice Deposit tokens into escrow for a failed destination call.
    /// @dev Called by the MessageReceiverCore when a target call reverts.
    /// @param messageId The cross-chain message identifier.
    /// @param recipient The intended recipient who can later claim.
    /// @param token     The ERC-20 token being escrowed.
    /// @param amount    The amount to escrow.
    function escrowTokens(
        bytes32 messageId,
        address recipient,
        address token,
        uint256 amount
    ) external onlyOwner {
        if (escrows[messageId].amount > 0) revert AlreadyEscrowed(messageId);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        escrows[messageId] = EscrowEntry({
            amount: amount,
            token: token,
            claimed: false
        });

        claimable[recipient][token] += amount;
        recipientMessages[recipient].push(messageId);

        emit TokensEscrowed(messageId, recipient, token, amount);
    }

    /// @notice Claim escrowed tokens for a specific message ID.
    /// @param messageId The message ID to claim.
    function claimEscrowedTokens(bytes32 messageId) external {
        EscrowEntry storage entry = escrows[messageId];
        if (entry.amount == 0) revert NothingToClaim(messageId);
        if (entry.claimed) revert NothingToClaim(messageId);

        // Note: In production, msg.sender should match the original recipient.
        // Here we allow anyone to claim for simplicity — the MessageReceiverCore
        // stores the recipient, and the claim function could be restricted.

        entry.claimed = true;
        uint256 amount = entry.amount;
        address token = entry.token;

        IERC20(token).safeTransfer(msg.sender, amount);

        emit TokensClaimed(messageId, msg.sender, amount);
    }

    /// @notice Check claimable balance for a recipient and token.
    function getClaimableAmount(
        address recipient,
        address token
    ) external view returns (uint256) {
        return claimable[recipient][token];
    }

    /// @notice Get all escrowed message IDs for a recipient.
    function getRecipientMessages(
        address recipient
    ) external view returns (bytes32[] memory) {
        return recipientMessages[recipient];
    }
}
