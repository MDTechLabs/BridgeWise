// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Eip712TransformSample {
    function verifyMessage(
        bytes32 messageHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (bool) {
        return ecrecover(messageHash, v, r, s) != address(0);
    }
}