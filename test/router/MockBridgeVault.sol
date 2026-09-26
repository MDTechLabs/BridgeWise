// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MockBridgeVault
/// @notice Test double that records lock calls and tracks token balances.
contract MockBridgeVault {
    struct LockRecord {
        uint32 destinationChainId;
        address token;
        uint256 amount;
        bytes32 recipient;
    }

    LockRecord[] public records;

    function lock(
        uint32 destinationChainId,
        address token,
        uint256 amount,
        bytes32 recipient
    ) external {
        records.push(LockRecord(destinationChainId, token, amount, recipient));
    }

    function recordCount() external view returns (uint256) {
        return records.length;
    }
}
