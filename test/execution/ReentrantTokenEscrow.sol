// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Malicious ERC20 for reentrancy regression tests. When armed, the next
///      transfer out of `target` calls `target.claimEscrowedTokens(messageId)`
///      again, mid-transfer, and records whether that reentrant call succeeded.
contract ReentrantTokenEscrow is ERC20 {
    address public target;
    bytes32 public messageId;
    bool public armed;
    bool public reentered;
    bool public reentrySucceeded;

    constructor() ERC20("Reentrant", "RE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address target_, bytes32 messageId_) external {
        target = target_;
        messageId = messageId_;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && from == target) {
            armed = false;
            reentered = true;
            (bool ok, ) = target.call(abi.encodeWithSignature("claimEscrowedTokens(bytes32)", messageId));
            reentrySucceeded = ok;
        }
    }
}
