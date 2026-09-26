// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FlashLoanGuard} from "../../contracts/security/FlashLoanGuard.sol";

/// @title FlashLoanGuardHarness
/// @notice Concrete harness exposing the internal FlashLoanGuard helpers for
///         unit testing.
contract FlashLoanGuardHarness is FlashLoanGuard {
    event Dispatched(address indexed sender);

    /// @notice Records a deposit for `msg.sender`.
    function recordDeposit() external {
        _recordDeposit();
    }

    /// @notice Simulates a cross-chain dispatch action protected by the guard.
    function guardedDispatch() external noSameBlockFlashLoan {
        emit Dispatched(msg.sender);
    }

    /// @notice Records a deposit and immediately dispatches in the same
    ///         transaction to test same-block flash-loan detection.
    function recordDepositAndDispatch() external {
        _recordDeposit();
        _checkFlashLoanGuard();
        emit Dispatched(msg.sender);
    }

    /// @notice Authorize or revoke bypass for `account`.
    function setBypass(address account, bool authorized) external {
        _setBypass(account, authorized);
    }
}
