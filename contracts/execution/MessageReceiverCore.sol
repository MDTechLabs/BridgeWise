// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MessageReceiverCore
/// @notice Resilient cross-chain message receiver that catches target contract execution
///         failures and diverts tokens into a FallbackEscrow rather than reverting the
///         entire cross-chain transaction.
/// @dev Executes target calls using low-level `.call()` inside assembly. On failure,
///      tokens are forwarded to FallbackEscrow for user claiming.
///
/// @dev EIP-712 domain spec (see docs/SIGNATURE_SPECIFICATION.md):
///      Messages reaching `executeMessage` MUST already have been verified against the
///      `BridgeWiseDomain` separator:
///
///        BridgeWiseDomain(string name,string version,uint256 sourceChainId,
///                         uint256 targetChainId,address bridgeAddress)
///
///      with `name = "BridgeWise"`, `version = "1"`, `targetChainId == block.chainid`
///      and `bridgeAddress == address(this)` on the verifying contract. The payload
///      type hash is:
///
///        BridgeMessage(bytes32 messageId,address sender,address recipient,
///                      address token,uint256 amount,uint256 nonce,
///                      uint256 deadline,bytes32 payloadHash)
///
///      `messageId` is the derived value `keccak256(abi.encode(sourceChainId,
///      targetChainId, sender, nonce))`, and `data` passed here MUST satisfy
///      `keccak256(data) == payloadHash`. This contract performs execution only — it
///      does NOT re-verify signatures, nonces, or deadlines.
contract MessageReceiverCore {
    using SafeERC20 for IERC20;

    /// @notice The FallbackEscrow contract for storing failed-call funds.
    address public immutable escrow;

    /// @notice Emitted when a message is executed successfully.
    event MessageExecuted(bytes32 indexed messageId, address indexed target, bool success);

    /// @notice Emitted when a failed call is diverted to escrow.
    event CallFailedEscrowed(bytes32 indexed messageId, address indexed recipient, address token, uint256 amount);

    /// @notice Thrown when the target contract address is invalid.
    error InvalidTarget();

    /// @param escrowAddress The FallbackEscrow contract address.
    constructor(address escrowAddress) {
        escrow = escrowAddress;
    }

    /// @notice Execute a cross-chain message payload against a target contract.
    ///         On failure, divert bridged tokens to the FallbackEscrow.
    /// @param messageId The cross-chain message identifier.
    /// @param target    The target contract to call.
    /// @param data      The calldata to send to the target.
    /// @param token     The bridged token being transferred.
    /// @param amount    The amount of tokens.
    /// @param recipient The fallback escrow recipient.
    /// @return success Whether the target call succeeded.
    function executeMessage(
        bytes32 messageId,
        address target,
        bytes calldata data,
        address token,
        uint256 amount,
        address recipient
    ) external returns (bool success) {
        if (target == address(0)) revert InvalidTarget();

        // Execute the target call with low-level call
        // solhint-disable-next-line avoid-low-level-calls
        (success, ) = target.call(data);

        if (!success) {
            // Divert tokens to escrow
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            // Forward to escrow contract
            // Approve escrow to pull tokens
            IERC20(token).forceApprove(escrow, amount);
            _escrowTokens(messageId, recipient, token, amount);

            emit CallFailedEscrowed(messageId, recipient, token, amount);
        }

        emit MessageExecuted(messageId, target, success);
        return success;
    }

    /// @dev Call into the FallbackEscrow's escrowTokens function.
    function _escrowTokens(
        bytes32 messageId,
        address recipient,
        address token,
        uint256 amount
    ) internal {
        // Encode and forward to the escrow contract
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, ) = escrow.call(
            abi.encodeWithSignature(
                "escrowTokens(bytes32,address,address,uint256)",
                messageId,
                recipient,
                token,
                amount
            )
        );
        require(ok, "Escrow deposit failed");
    }
}
