// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BridgeAccessControl} from "../../contracts/access/BridgeAccessControl.sol";

/// @title MockRelayerCallbackHandler
/// @notice Test double shaped like a destination-chain callback handler (e.g.
///         `MessageReceiverCore`) that mixes in `BridgeAccessControl` to gate its
///         callback entry point behind `onlyRelayer`. Exists purely to prove the
///         modifier composes correctly into a realistic callback-handler contract.
contract MockRelayerCallbackHandler is BridgeAccessControl {
    /// @notice Emitted when a gated callback is executed by an authorized relayer.
    event MessageDelivered(bytes32 indexed messageId, address indexed relayer);

    uint256 public deliveredCount;

    constructor(address initialAdmin, address[] memory initialRelayers)
        BridgeAccessControl(initialAdmin, initialRelayers)
    {}

    /// @notice Simulates a destination-chain callback that only a relayer may invoke.
    function deliverMessage(bytes32 messageId) external onlyRelayer returns (bool) {
        deliveredCount += 1;
        emit MessageDelivered(messageId, msg.sender);
        return true;
    }
}
