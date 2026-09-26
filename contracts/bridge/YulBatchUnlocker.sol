// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract YulBatchUnlocker {
    event UnlockFailed(address indexed recipient, uint256 amount);
    bytes32 private constant UNLOCK_FAILED_SIG = keccak256("UnlockFailed(address,uint256)");

    receive() external payable {}

    function unlockBatch(address[] calldata recipients, uint256[] calldata amounts) external payable {
        require(recipients.length == amounts.length, "YulBatchUnlocker: Mismatched arrays");
        bytes32 sig = UNLOCK_FAILED_SIG;

        assembly {
            let len := recipients.length
            let recOffset := add(recipients.offset, 0x20)
            let amtOffset := add(amounts.offset, 0x20)
            let sigVar := sig

            for { let i := 0 } lt(i, len) { i := add(i, 1) } {
                let byteOffset := mul(i, 0x20)
                let rec := calldataload(add(recOffset, byteOffset))
                let amt := calldataload(add(amtOffset, byteOffset))
                let success := call(gas(), rec, amt, 0, 0, 0, 0)
                if iszero(success) {
                    mstore(0x00, sigVar)
                    mstore(0x20, rec)
                    mstore(0x40, amt)
                    log1(0x00, 0x60, sigVar)
                }
            }
        }
    }
}
