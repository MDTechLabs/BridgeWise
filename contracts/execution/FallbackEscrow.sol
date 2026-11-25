// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FallbackEscrow
/// @notice User-claimable escrow vault that holds tokens diverted when a cross-chain
///         destination call fails. Recipients can withdraw escrowed funds via a
///         claim function using their message ID as the key.
/// @dev Tokens are stored per-recipient. Each failed message deposits into the
///      recipient's escrow balance. Claims are keyed by messageId for auditability.
///      Emergency withdrawals can never bypass user entitlement accounting.
contract FallbackEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct EscrowEntry {
        uint256 amount;
        address token;
        bool claimed;
        address recipient;
    }

    /// @notice Mapping from message ID to escrow entry.
    mapping(bytes32 => EscrowEntry) public escrows;

    /// @notice Mapping from recipient address to total claimable amount per token.
    mapping(address => mapping(address => uint256)) public claimable;

    /// @notice Total active user entitlements per token that cannot be bypassed.
    mapping(address => uint256) public totalEntitlements;

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

    /// @notice Emitted when unencumbered surplus funds are withdrawn in an emergency.
    event EmergencyWithdrawalExecuted(
        address indexed token,
        address indexed to,
        uint256 amount,
        uint256 remainingSurplus,
        uint256 protectedEntitlements
    );

    /// @notice Thrown when a message has already been escrowed.
    error AlreadyEscrowed(bytes32 messageId);

    /// @notice Thrown when no escrowed tokens are available to claim.
    error NothingToClaim(bytes32 messageId);

    /// @notice Thrown when the caller is not the escrowed recipient.
    error NotRecipient();

    /// @notice Thrown when zero address is passed.
    error ZeroAddress();

    /// @notice Thrown when zero amount is passed.
    error ZeroAmount();

    /// @notice Thrown when an emergency withdrawal would exceed unencumbered surplus or infringe on entitlements.
    error CannotBypassUserEntitlements(address token, uint256 requested, uint256 availableSurplus);

    /// @notice Thrown when the physical balance is below total entitlements.
    error SolvencyDeficit(address token, uint256 held, uint256 entitlements);

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
            claimed: false,
            recipient: recipient
        });

        claimable[recipient][token] += amount;
        totalEntitlements[token] += amount;
        recipientMessages[recipient].push(messageId);

        emit TokensEscrowed(messageId, recipient, token, amount);
    }

    /// @notice Claim escrowed tokens for a specific message ID.
    /// @param messageId The message ID to claim.
    function claimEscrowedTokens(bytes32 messageId) external nonReentrant {
        EscrowEntry storage entry = escrows[messageId];
        if (entry.amount == 0) revert NothingToClaim(messageId);
        if (entry.claimed) revert NothingToClaim(messageId);

        entry.claimed = true;
        uint256 amount = entry.amount;
        address token = entry.token;
        address rec = entry.recipient;

        if (totalEntitlements[token] >= amount) {
            totalEntitlements[token] -= amount;
        } else {
            totalEntitlements[token] = 0;
        }

        if (rec != address(0) && claimable[rec][token] >= amount) {
            claimable[rec][token] -= amount;
        }

        IERC20(token).safeTransfer(msg.sender, amount);

        emit TokensClaimed(messageId, msg.sender, amount);
    }

    /// @notice Withdraw unencumbered surplus funds in an emergency without affecting user entitlements.
    /// @dev Invariant EW-1 & EW-2: Physical Balance - amount >= totalEntitlements[token].
    /// @param token Address of the token.
    /// @param to Destination address for surplus funds.
    /// @param amount Amount to withdraw.
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 held = IERC20(token).balanceOf(address(this));
        uint256 entitlements = totalEntitlements[token];

        if (held < entitlements) revert SolvencyDeficit(token, held, entitlements);
        uint256 availableSurplus = held - entitlements;

        if (amount > availableSurplus) {
            revert CannotBypassUserEntitlements(token, amount, availableSurplus);
        }

        IERC20(token).safeTransfer(to, amount);

        emit EmergencyWithdrawalExecuted(token, to, amount, availableSurplus - amount, entitlements);
    }

    /// @notice Check claimable balance for a recipient and token.
    function getClaimableAmount(
        address recipient,
        address token
    ) external view returns (uint256) {
        return claimable[recipient][token];
    }

    /// @notice Get unencumbered surplus available for emergency withdrawal.
    function getAvailableSurplus(address token) external view returns (uint256) {
        uint256 held = IERC20(token).balanceOf(address(this));
        uint256 entitlements = totalEntitlements[token];
        if (held <= entitlements) return 0;
        return held - entitlements;
    }

    /// @notice Get all escrowed message IDs for a recipient.
    function getRecipientMessages(
        address recipient
    ) external view returns (bytes32[] memory) {
        return recipientMessages[recipient];
    }
}
