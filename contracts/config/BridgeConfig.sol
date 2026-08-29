// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BridgeConfig
/// @notice Stores static bridge parameters as immutable variables to eliminate
///         SLOAD gas costs during cross-chain configuration verification.
contract BridgeConfig {
    event ConfigDeployed(uint256 indexed targetChainId, address indexed router);

    uint256 public immutable targetChainId;
    address public immutable router;

    error ZeroRouterAddress();

    constructor(uint256 _targetChainId, address _router) {
        if (_router == address(0)) revert ZeroRouterAddress();
        targetChainId = _targetChainId;
        router = _router;
        emit ConfigDeployed(_targetChainId, _router);
    }
}
