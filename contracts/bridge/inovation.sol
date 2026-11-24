
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title YulBatchUnlocker
/// @notice Executes multiple native-token transfers in a single transaction.
/// @dev Failed transfers are recorded through UnlockFailed events without
///      reverting successful transfers or stopping the remaining batch.
contract YulBatchUnlocker {
    /// @notice Emitted when a recipient's transfer fails.
    /// @param recipient Address that could not receive the transfer.
    /// @param amount Amount of native tokens that could not be transferred.
    event UnlockFailed(address indexed recipient, uint256 amount);

    /// @dev Event signature used by the Yul LOG1 opcode.
    bytes32 private constant UNLOCK_FAILED_SIG =
        keccak256("UnlockFailed(address,uint256)");

    /// @notice Allows the contract to receive native tokens.
    receive() external payable {}

    /// @notice Transfers native tokens to multiple recipients.
    /// @dev Uses Yul CALL to execute transfers and LOG1 to emit failure events.
    ///      Failed transfers do not interrupt subsequent transfers.
    /// @param recipients Addresses receiving the transfers.
    /// @param amounts Amounts to transfer to each recipient.
    function unlockBatch(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external payable {
        require(
            recipients.length == amounts.length,
            "YulBatchUnlocker: Mismatched arrays"
        );

        bytes32 eventSignature = UNLOCK_FAILED_SIG;

        assembly {
            let length := recipients.length
            let recipientsOffset := recipients.offset
            let amountsOffset := amounts.offset

            for {
                let i := 0
            } lt(i, length) {
                i := add(i, 1)
            } {
                let offset := mul(i, 0x20)

                let recipient := calldataload(
                    add(recipientsOffset, offset)
                )

                let amount := calldataload(
                    add(amountsOffset, offset)
                )

                // Attempt the native-token transfer.
                let success := call(
                    gas(),
                    recipient,
                    amount,
                    0,
                    0,
                    0,
                    0
                )

                // Record failed transfers without reverting the batch.
                if iszero(success) {
                    mstore(0x00, eventSignature)
                    mstore(0x20, recipient)
                    mstore(0x40, amount)

                    log1(0x00, 0x60, eventSignature)
                }
            }
        }
    }
}
