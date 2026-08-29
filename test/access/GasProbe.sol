// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title GasProbe
/// @notice Test-only helper that measures the exact gas consumed by an external
///         call, including calls that revert. A low-level `.call()` absorbs the
///         revert instead of bubbling it up, allowing `gasleft()` to be sampled
///         immediately before and after — the standard technique for measuring
///         the gas cost of a reverting call (a top-level reverted transaction has
///         no `gasUsed` on its receipt).
contract GasProbe {
    /// @notice Executes `data` against `target` and reports gas consumed and success.
    function measure(address target, bytes calldata data) external returns (uint256 gasUsed, bool success) {
        uint256 gasBefore = gasleft();
        // solhint-disable-next-line avoid-low-level-calls
        (success, ) = target.call(data);
        gasUsed = gasBefore - gasleft();
    }
}
