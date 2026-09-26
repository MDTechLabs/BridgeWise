// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title SafeApprovalHandler
/// @notice Resets token allowance to zero before granting new allowance to handle non-standard ERC-20 tokens.
contract SafeApprovalHandler {
    event ApprovalResetAndGranted(address indexed token, address indexed spender, uint256 value);

    function safeResetAndApprove(IERC20 token, address spender, uint256 value) external {
        if (token.allowance(address(this), spender) != 0) {
            require(token.approve(spender, 0), "Reset allowance failed");
        }
        require(token.approve(spender, value), "Set allowance failed");
        emit ApprovalResetAndGranted(address(token), spender, value);
    }
}
