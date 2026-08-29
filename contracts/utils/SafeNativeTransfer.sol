// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SafeNativeTransfer
/// @notice Gas-optimised native-asset transfer helper for bridge unlock / refund paths.
/// @dev Replaces the naked `to.call{value: amount}("")` pattern.
///
///      The high-level form allocates an empty `bytes` argument in memory, and — when the
///      return data is captured in order to bubble a reason string — copies the entire
///      callee revert payload into dynamic memory before the transaction unwinds. A
///      malicious or merely verbose recipient therefore controls how much gas a *failed*
///      claim burns.
///
///      This helper forwards all gas but pins both the argument and return-data windows to
///      zero length, so nothing is ever copied back, and signals failure with the 4-byte
///      {NativeTransferFailed} selector.
library SafeNativeTransfer {
    /// @notice The native-asset transfer reverted or the recipient rejected it.
    /// @dev Selector `0xf4b3b1bc` — mirrored as a literal in the assembly block below.
    error NativeTransferFailed();

    /// @notice Sends `amount` wei to `to`, forwarding all remaining gas.
    /// @dev Reverts with {NativeTransferFailed} if the call does not succeed. The recipient
    ///      is still free to consume the forwarded gas, so callers that need re-entrancy
    ///      protection must apply it themselves — this helper only bounds the *return* path.
    /// @param to Recipient of the native asset.
    /// @param amount Amount in wei. A zero amount is a no-op call, not a revert.
    function safeTransferNative(address to, uint256 amount) internal {
        assembly ("memory-safe") {
            // call(gas, addr, value, argsOffset, argsSize, retOffset, retSize)
            //
            // `codesize()` is used for both memory offsets: it is guaranteed non-zero and,
            // paired with a zero length, it neither triggers memory expansion nor copies
            // any return data. No memory is touched on either the success or failure path.
            if iszero(call(gas(), to, amount, codesize(), 0x00, codesize(), 0x00)) {
                // `NativeTransferFailed()`
                mstore(0x00, 0xf4b3b1bc)
                // Revert with the 4 low-order bytes of the scratch word.
                revert(0x1c, 0x04)
            }
        }
    }
}
