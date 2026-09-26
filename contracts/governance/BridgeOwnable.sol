// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title BridgeOwnable
/// @notice Core contract inheriting OpenZeppelin Ownable2Step for safe 2-step ownership transfers.
contract BridgeOwnable is Ownable2Step {
    constructor(address initialOwner) Ownable(initialOwner) {}

    function cancelOwnershipTransfer() external onlyOwner {
        transferOwnership(address(0));
    }
}
