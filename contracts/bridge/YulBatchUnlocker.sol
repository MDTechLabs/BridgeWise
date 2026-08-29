// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title YulBatchUnlocker
 * @notice Processes multi-recipient native currency payouts within a single execution loop using highly optimized Yul assembly.
 */
contract YulBatchUnlocker {
    /// @notice Emitted when a native transfer fails. 
    /// @dev Allows off-chain tracking of failed unlocks without halting the entire batch.
    event UnlockFailed(address indexed recipient, uint256 amount);

    // Precomputed event signature for UnlockFailed(address,uint256)
    bytes32 private constant UNLOCK_FAILED_SIG = keccak256("UnlockFailed(address,uint256)");

    /// @notice Allows the contract to be funded with native currency (ETH).
    receive() external payable {}

    /**
     * @notice Unlocks native currency to multiple recipients using low-level calls in Yul.
     * @param recipients Array of recipient addresses.
     * @param amounts Array of corresponding transfer amounts.
     */
    function unlockBatch(address[] calldata recipients, uint256[] calldata amounts) external payable {
        require(recipients.length == amounts.length, "YulBatchUnlocker: Mismatched arrays");

        assembly {
            // Cache array length
            let len := recipients.length
            
            // Extract the offset (start position) of the array data in calldata
            let recOffset := recipients.offset
            let amtOffset := amounts.offset
            let sig := UNLOCK_FAILED_SIG
            
            // Loop through each recipient and process the transfer
            for { let i := 0 } lt(i, len) { i := add(i, 1) } {
                // Calculate the byte offset for the current element (i * 32)
                let byteOffset := mul(i, 0x20)
                
                // Load the address and amount directly from calldata
                let rec := calldataload(add(recOffset, byteOffset))
                let amt := calldataload(add(amtOffset, byteOffset))
                
                // Execute a low-level call transferring the specified amount of native currency
                // forward all available gas (gas()), to address (rec), value (amt), 0 args, 0 ret
                let success := call(gas(), rec, amt, 0, 0, 0, 0)
                
                // If the transfer fails, emit the UnlockFailed event and continue
                if iszero(success) {
                    // Store the unindexed 'amount' parameter in memory scratch space (0x00)
                    mstore(0x00, amt)
                    // Emit event: log2(memoryOffset, memorySize, topic0, topic1)
                    // topic0 = signature hash, topic1 = indexed recipient address
                    log2(0x00, 0x20, sig, rec)
                }
            }
        }
    }
}
