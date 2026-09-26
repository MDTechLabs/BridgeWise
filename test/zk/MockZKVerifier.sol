// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockZKVerifier
/// @notice Mock ZK verifier that always returns true. Used for testing ZKVerifierRegistry.
contract MockZKVerifier {
    bool public lastResult;

    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}
