// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BridgeSender
/// @notice Source-chain contract that dispatches cross-chain messages with
///         auto-incrementing nonces per destination chain.
contract BridgeSender {
    /// @notice Emitted when a cross-chain message is dispatched.
    event MessageDispatched(
        uint32 indexed destinationChainId,
        uint64 indexed nonce,
        bytes32 messageHash,
        bytes payload
    );

    /// @notice Maps destination chain ID to the next outbound nonce.
    mapping(uint32 => uint64) public outboundNonces;

    /// @notice Dispatch a cross-chain message to the specified destination chain.
    /// @param destinationChainId The target chain identifier.
    /// @param payload            The arbitrary message payload.
    /// @return nonce             The nonce assigned to this message.
    function dispatchMessage(
        uint32 destinationChainId,
        bytes calldata payload
    ) external virtual returns (uint64 nonce) {
        nonce = outboundNonces[destinationChainId];
        outboundNonces[destinationChainId] = nonce + 1;

        bytes32 messageHash = keccak256(abi.encodePacked(destinationChainId, nonce, payload));

        emit MessageDispatched(destinationChainId, nonce, messageHash, payload);
    }
}
