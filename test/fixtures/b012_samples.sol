// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}

contract SafeApproveExamples {
    IERC20 public token;

    // BAD: Doesn't reset to 0 first
    function unsafeApprove(address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    // GOOD: Resets to 0 first
    function safeApprove(address spender, uint256 amount) external {
        token.approve(spender, 0);
        token.approve(spender, amount);
    }
}
