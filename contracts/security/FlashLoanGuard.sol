// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FlashLoanGuard
/// @notice Base contract that prevents same-block borrow-bridge-swap arbitrage
///         by tracking the ledger height of the most recent deposit for each
///         account and reverting cross-chain dispatch actions that occur in the
///         same block as the deposit.
/// @dev Inherit this contract and call `_recordDeposit()` on every deposit-like
///      entry point and apply the `noSameBlockFlashLoan` modifier (or call
///      `_checkFlashLoanGuard()`) on every cross-chain dispatch action.
abstract contract FlashLoanGuard {
    /// @notice Last block number in which an account made a deposit.
    mapping(address => uint256) private _lastDepositBlock;

    /// @notice Accounts that are authorized to bypass the guard. Intended for
    ///         verified contract router integrations that perform atomic
    ///         multi-step operations under protocol-controlled conditions.
    mapping(address => bool) private _bypassAuthorized;

    /// @notice Thrown when an account attempts a dispatch in the same block as
    ///         its deposit.
    error SameBlockFlashLoan(address account);

    /// @notice Emitted when an account's deposit block is recorded.
    event DepositRecorded(address indexed account, uint256 blockNumber);

    /// @notice Emitted when bypass authorization is changed for an account.
    event BypassUpdated(address indexed account, bool authorized);

    /// @notice Restricts execution when the caller deposited in the same block.
    modifier noSameBlockFlashLoan() {
        _checkFlashLoanGuard();
        _;
    }

    /// @notice Record `msg.sender`'s current block as its most recent deposit.
    /// @dev Call this at the end of deposit/lock entry points.
    function _recordDeposit() internal {
        _lastDepositBlock[msg.sender] = block.number;
        emit DepositRecorded(msg.sender, block.number);
    }

    /// @notice Revert if `msg.sender` is not bypass-authorized and deposited in
    ///         the current block.
    function _checkFlashLoanGuard() internal view {
        if (!_bypassAuthorized[msg.sender] && _lastDepositBlock[msg.sender] == block.number) {
            revert SameBlockFlashLoan(msg.sender);
        }
    }

    /// @notice Authorize or revoke bypass for `account`. Intended to be called
    ///         by an admin function in the inheriting contract.
    function _setBypass(address account, bool authorized) internal {
        _bypassAuthorized[account] = authorized;
        emit BypassUpdated(account, authorized);
    }

    /// @notice Return whether `account` is authorized to bypass the guard.
    function isBypassAuthorized(address account) external view returns (bool) {
        return _bypassAuthorized[account];
    }
}
