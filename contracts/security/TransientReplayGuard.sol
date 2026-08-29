// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TransientReplayGuard
/// @notice Intra-transaction replay protection using EIP-1153 transient storage.
///         Prevents the same message hash from being executed twice within a single
///         transaction call graph, with zero persistent storage overhead.
/// @dev Uses TSTORE/TLOAD opcodes to set and check execution locks. Transient
///      storage is automatically cleared at transaction end, eliminating the gas
///      refund overhead of persistent SSTORE-based reentrancy guards.
///
/// @dev Nonce validation scope (see docs/SIGNATURE_SPECIFICATION.md §5):
///      This guard is INTRA-transaction only. Transient storage is wiped at the end of
///      the transaction, so it cannot detect a message replayed in a later block. It is
///      a complement to, never a replacement for, the persistent nonce and executed-set
///      tracking required of every verifier:
///
///        mapping(uint256 sourceChainId => mapping(address sender => uint256 nonce))
///
///      A message is accepted only when `nonce == expectedNonce[sourceChainId][sender]`,
///      and that counter is incremented before any external call. Gaps are not
///      permitted, and nonce state is never reset on validator set rotation.
///
///      `messageHash` passed here MUST be the signed EIP-712 `messageId`
///      (`keccak256(abi.encode(sourceChainId, targetChainId, sender, nonce))`), not a
///      raw calldata digest — otherwise the lock is not bound to the message's lane.
abstract contract TransientReplayGuard {
    /// @notice Thrown when a message hash is replayed within the same transaction.
    error MessageReplayed(bytes32 messageHash);

    /// @notice Emitted when a message is locked for execution.
    event MessageLocked(bytes32 messageHash);

    /// @notice Acquire an execution lock for `messageHash`. Reverts if already locked.
    /// @param messageHash The identifier of the cross-chain message being executed.
    function _acquireLock(bytes32 messageHash) internal {
        assembly {
            // Store the namespace string "bridgewise.transient.replay" in memory
            mstore(0x00, 0x627269646765776973652e7472616e7369656e742e7265706c61790000000000)
            let namespace := keccak256(0x00, 27)
            let slot := add(namespace, messageHash)
            let locked := tload(slot)
            if locked {
                mstore(0x00, 0x0351bfb300000000000000000000000000000000000000000000000000000000) // MessageReplayed selector
                mstore(0x04, messageHash)
                revert(0x00, 0x24)
            }
            tstore(slot, 1)
        }
        emit MessageLocked(messageHash);
    }

    /// @notice Check whether `messageHash` is currently locked (already executed).
    /// @param messageHash The message hash to check.
    /// @return True if the lock is held.
    function _isLocked(bytes32 messageHash) internal view returns (bool) {
        assembly {
            mstore(0x00, 0x627269646765776973652e7472616e7369656e742e7265706c61790000000000)
            let namespace := keccak256(0x00, 27)
            let slot := add(namespace, messageHash)
            let val := tload(slot)
            mstore(0x00, val)
            return(0x00, 0x20)
        }
    }

    /// @notice Manually release a lock. Intended for compensating logic only.
    /// @param messageHash The message hash to unlock.
    function _releaseLock(bytes32 messageHash) internal {
        assembly {
            mstore(0x00, 0x627269646765776973652e7472616e7369656e742e7265706c61790000000000)
            let namespace := keccak256(0x00, 27)
            let slot := add(namespace, messageHash)
            tstore(slot, 0)
        }
    }
}
