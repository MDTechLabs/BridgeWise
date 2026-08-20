// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title NonceSlotCalculator
/// @notice Yul-based storage slot calculator for a nested nonce mapping:
///         `mapping(uint256 chainId => mapping(uint256 nonce => bool))`.
/// @dev Derives storage slot locations by writing keys directly into EVM scratch
///      space (0x00–0x3f) and hashing in-place with keccak256(0x00, 0x40).
///      The free memory pointer at 0x40 is never read or written, so no memory
///      expansion occurs and no gas is paid for memory growth.
///
///      Solidity mapping storage layout (Solidity docs §Layout of State Variables):
///        • Outer slot: keccak256(chainId . outerMappingSlot)
///        • Inner slot: keccak256(nonce  . outerSlot)
///
///      Where `.` denotes 32-byte left-padded concatenation in memory.
library NonceSlotCalculator {
    /// @notice Computes the storage slot for `nonces[chainId][nonce]`.
    /// @dev The outer mapping `nonces` occupies storage slot 0 in the consuming
    ///      contract.  Callers that store the mapping at a different slot should
    ///      use {slotForNonceAt}.
    /// @param chainId The chain identifier key (outer mapping key).
    /// @param nonce   The message nonce key (inner mapping key).
    /// @return slot   The storage slot that holds the bool value.
    function slotForNonce(
        uint256 chainId,
        uint256 nonce
    ) internal pure returns (bytes32 slot) {
        return slotForNonceAt(chainId, nonce, 0);
    }

    /// @notice Computes the storage slot for `nonces[chainId][nonce]` where
    ///         the outer mapping lives at an arbitrary `mappingSlot`.
    /// @param chainId     The chain identifier key (outer mapping key).
    /// @param nonce       The message nonce key (inner mapping key).
    /// @param mappingSlot The storage slot of the outer mapping variable.
    /// @return slot       The storage slot that holds the bool value.
    function slotForNonceAt(
        uint256 chainId,
        uint256 nonce,
        uint256 mappingSlot
    ) internal pure returns (bytes32 slot) {
        assembly {
            // ---------------------------------------------------------------
            // Step 1 — outer slot: keccak256(chainId ‖ mappingSlot)
            //
            // Scratch-space layout (0x00–0x3f):
            //   0x00 : chainId       (32 bytes)
            //   0x20 : mappingSlot   (32 bytes)
            // ---------------------------------------------------------------
            mstore(0x00, chainId)
            mstore(0x20, mappingSlot)
            let outerSlot := keccak256(0x00, 0x40)

            // ---------------------------------------------------------------
            // Step 2 — inner slot: keccak256(nonce ‖ outerSlot)
            //
            // Reuse the same scratch words — no additional memory touched.
            //   0x00 : nonce        (32 bytes)
            //   0x20 : outerSlot    (32 bytes)
            // ---------------------------------------------------------------
            mstore(0x00, nonce)
            mstore(0x20, outerSlot)
            slot := keccak256(0x00, 0x40)
        }
    }
}
