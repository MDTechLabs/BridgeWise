// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BatchDispatched
/// @notice Batch dispatching helper using unchecked increment loop counters for gas efficiency.
contract BatchDispatched {
    event BatchItemProcessed(address indexed target, uint256 value);

    function processBatch(address[] calldata targets, uint256[] calldata values) external {
        require(targets.length == values.length, "Length mismatch");
        uint256 len = targets.length;
        for (uint256 i; i < len; ) {
            emit BatchItemProcessed(targets[i], values[i]);
            unchecked { ++i; }
        }
    }
}
