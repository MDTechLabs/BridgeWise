// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockGasTarget
/// @notice Mock contract for testing gas refund execution calls.
contract MockGasTarget {
    event SimpleCalled();
    event RevertingCalled();

    /// @notice A simple call that consumes some gas and succeeds.
    function simpleCall() external {
        // Consume some gas with a loop
        for (uint256 i = 0; i < 100; i++) {
            assembly {
                let _ := i
            }
        }
        emit SimpleCalled();
    }

    /// @notice A call that always reverts.
    function revertingCall() external {
        emit RevertingCalled();
        revert("Mock revert");
    }

    /// @notice A call that consumes significant gas.
    function gasIntensiveCall(uint256 iterations) external {
        for (uint256 i = 0; i < iterations; i++) {
            assembly {
                let _ := i
            }
        }
    }
}
