// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title DepositGuard
/// @notice Configurable minimum and maximum deposit bounds guard.
contract DepositGuard is AccessControl {
    error DepositTooSmall(uint256 amount, uint256 minRequired);
    error DepositTooLarge(uint256 amount, uint256 maxAllowed);

    mapping(address => uint256) public minDeposit;
    mapping(address => uint256) public maxDeposit;

    event MinDepositSet(address indexed token, uint256 amount);
    event MaxDepositSet(address indexed token, uint256 amount);
    event DepositProcessed(address indexed token, address indexed sender, uint256 amount);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function setMinDeposit(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minDeposit[token] = amount;
        emit MinDepositSet(token, amount);
    }

    function setMaxDeposit(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxDeposit[token] = amount;
        emit MaxDepositSet(token, amount);
    }

    function deposit(address token, uint256 amount) external {
        uint256 minAmt = minDeposit[token];
        uint256 maxAmt = maxDeposit[token];

        if (minAmt > 0 && amount < minAmt) {
            revert DepositTooSmall(amount, minAmt);
        }
        if (maxAmt > 0 && amount > maxAmt) {
            revert DepositTooLarge(amount, maxAmt);
        }

        emit DepositProcessed(token, msg.sender, amount);
    }
}
