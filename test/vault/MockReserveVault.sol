// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockReserveVault
/// @notice Test double allowing manual configuration of per-token locked reserves.
contract MockReserveVault {
    mapping(address => uint256) public lockedReserves;

    function setLockedReserves(address token, uint256 amount) external {
        lockedReserves[token] = amount;
    }
}
