// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RejectorMock
 * @notice A mock contract for testing failed native transfers. Reverts when receiving ETH.
 */
contract RejectorMock {
    receive() external payable {
        revert("RejectorMock: ETH not accepted");
    }
}
