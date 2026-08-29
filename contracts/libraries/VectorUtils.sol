// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VectorUtils
/// @notice Gas-optimized vector math utilities using unchecked loop iteration counters.
library VectorUtils {
    function sum(uint256[] calldata array) internal pure returns (uint256 total) {
        uint256 len = array.length;
        for (uint256 i; i < len; ) {
            total += array[i];
            unchecked { ++i; }
        }
    }


    
}
