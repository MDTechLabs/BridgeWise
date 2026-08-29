// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockMessageTarget
/// @notice Minimal target-handler test double for YulBatchRouter. Exposes one
///         function that always succeeds (recording what it was called with)
///         and one that always reverts, so tests can exercise both the
///         successful-delivery path and the failure-isolation path.
contract MockMessageTarget {
    event Executed(address indexed caller, uint256 value);

    /// @notice Number of times `record` has been called successfully.
    uint256 public callCount;
    /// @notice The `value` argument from the most recent successful `record` call.
    uint256 public lastValue;

    error MockRevert(string reason);

    /// @notice Always succeeds; records the call for assertions.
    function record(uint256 value) external returns (uint256) {
        callCount++;
        lastValue = value;
        emit Executed(msg.sender, value);
        return value;
    }

    /// @notice Always reverts with `reason`, to test sub-call failure isolation.
    function fail(string calldata reason) external pure {
        revert MockRevert(reason);
    }
}
