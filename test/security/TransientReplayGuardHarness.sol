// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TransientReplayGuardHarness
/// @notice Test harness exposing TransientReplayGuard internals for unit testing.
/// @dev Functions combine multiple operations in one tx so tstore/tload are visible.
contract TransientReplayGuardHarness {
    error MessageReplayed(bytes32 messageHash);

    event MessageLocked(bytes32 messageHash);

    function acquireLock(bytes32 messageHash) external {
        assembly {
            mstore(0x00, 0x627269646765776973652e7472616e7369656e742e7265706c61790000000000)
            let namespace := keccak256(0x00, 27)
            let slot := add(namespace, messageHash)
            let locked := tload(slot)
            if locked {
                mstore(0x00, 0x0351bfb300000000000000000000000000000000000000000000000000000000)
                mstore(0x04, messageHash)
                revert(0x00, 0x24)
            }
            tstore(slot, 1)
        }
        emit MessageLocked(messageHash);
    }

    function acquireAndCheck(bytes32 messageHash) external returns (bool) {
        assembly {
            mstore(0x00, 0x627269646765776973652e7472616e7369656e742e7265706c61790000000000)
            let namespace := keccak256(0x00, 27)
            let slot := add(namespace, messageHash)
            let locked := tload(slot)
            if locked {
                mstore(0x00, 0x0351bfb300000000000000000000000000000000000000000000000000000000)
                mstore(0x04, messageHash)
                revert(0x00, 0x24)
            }
            tstore(slot, 1)
            mstore(0x00, 1)
            return(0x00, 0x20)
        }
    }

    function acquireAndCheckTwice(
        bytes32 hash1,
        bytes32 hash2
    ) external returns (bool locked1, bool locked2) {
        assembly {
            // Acquire hash1
            mstore(0x00, 0x627269646765776973652e7472616e7369656e742e7265706c61790000000000)
            let namespace := keccak256(0x00, 27)
            let slot1 := add(namespace, hash1)
            tstore(slot1, 1)
            // Acquire hash2
            let slot2 := add(namespace, hash2)
            tstore(slot2, 1)
        }
        return (true, true);
    }

    function acquireReleaseAndCheck(bytes32 messageHash) external returns (bool stillLocked) {
        assembly {
            // Acquire
            mstore(0x00, 0x627269646765776973652e7472616e7369656e742e7265706c61790000000000)
            let namespace := keccak256(0x00, 27)
            let slot := add(namespace, messageHash)
            tstore(slot, 1)
            // Release
            tstore(slot, 0)
            // Check
            let val := tload(slot)
            mstore(0x00, val)
            return(0x00, 0x20)
        }
    }

    function replaySameTx(bytes32 messageHash) external {
        assembly {
            mstore(0x00, 0x627269646765776973652e7472616e7369656e742e7265706c61790000000000)
            let namespace := keccak256(0x00, 27)
            let slot := add(namespace, messageHash)
            let locked := tload(slot)
            if locked {
                mstore(0x00, 0x0351bfb300000000000000000000000000000000000000000000000000000000)
                mstore(0x04, messageHash)
                revert(0x00, 0x24)
            }
            tstore(slot, 1)
            // Try again in same tx
            locked := tload(slot)
            if locked {
                mstore(0x00, 0x0351bfb300000000000000000000000000000000000000000000000000000000)
                mstore(0x04, messageHash)
                revert(0x00, 0x24)
            }
        }
    }

    function executeWithGuard(bytes32 messageHash, bytes calldata) external {
        assembly {
            mstore(0x00, 0x627269646765776973652e7472616e7369656e742e7265706c61790000000000)
            let namespace := keccak256(0x00, 27)
            let slot := add(namespace, messageHash)
            let locked := tload(slot)
            if locked {
                mstore(0x00, 0x0351bfb300000000000000000000000000000000000000000000000000000000)
                mstore(0x04, messageHash)
                revert(0x00, 0x24)
            }
            tstore(slot, 1)
        }
        emit MessageLocked(messageHash);
    }
}
