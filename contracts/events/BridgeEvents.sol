// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BridgeEvents
/// @notice Standardized cross-chain message event declarations.
///         All bridge modules SHOULD emit these events (or inherit this contract)
///         to ensure consistent topic indexing for off-chain relayers and indexers.
abstract contract BridgeEvents {
    /// @notice Emitted when a cross-chain message is sent (source chain side).
    /// @param msgHash    Unique hash identifying the message.
    /// @param srcChainId Source chain identifier.
    /// @param dstChainId Destination chain identifier.
    /// @param nonce      Sequential nonce assigned to this message.
    event MessageSent(
        bytes32 indexed msgHash,
        uint32 indexed srcChainId,
        uint32 indexed dstChainId,
        uint64 nonce
    );

    /// @notice Emitted when a cross-chain message is successfully delivered
    ///         and executed (destination chain side).
    /// @param msgHash    Unique hash identifying the message.
    /// @param srcChainId Source chain identifier.
    /// @param dstChainId Destination chain identifier.
    /// @param success    Whether the target execution succeeded.
    event MessageDelivered(
        bytes32 indexed msgHash,
        uint32 indexed srcChainId,
        uint32 indexed dstChainId,
        bool success
    );

    /// @notice Emitted when a cross-chain message execution fails and tokens
    ///         are diverted to a fallback escrow.
    /// @param msgHash    Unique hash identifying the message.
    /// @param srcChainId Source chain identifier.
    /// @param dstChainId Destination chain identifier.
    /// @param recipient  The intended recipient for fallback claim.
    /// @param token      The bridged token address.
    /// @param amount     The amount escrowed.
    event MessageFailed(
        bytes32 indexed msgHash,
        uint32 indexed srcChainId,
        uint32 indexed dstChainId,
        address recipient,
        address token,
        uint256 amount
    );
}
