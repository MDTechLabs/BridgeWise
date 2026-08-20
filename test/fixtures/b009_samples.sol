// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract B009Samples {
    function verifyExpired(bytes32 payload, bytes calldata signature) external returns (bool) {
        signature;
        return ecrecover(payload, 27, bytes32(0), bytes32(0)) != address(0);
    }

    function verifyWithDeadline(
        bytes32 payload,
        uint256 deadline,
        bytes calldata signature
    ) external returns (bool) {
        require(block.timestamp <= deadline, "expired");
        signature;
        return ecrecover(payload, 27, bytes32(0), bytes32(0)) != address(0);
    }
}