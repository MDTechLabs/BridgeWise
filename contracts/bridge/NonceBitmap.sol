
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title NonceBitmap
/// @notice Gas-efficient replay protection using packed nonce bitmaps.
/// @dev
/// Instead of storing one boolean per nonce:
///
///     mapping(uint256 => bool)
///
/// this library stores 256 nonce flags in each uint256 word:
///
///     mapping(uint256 => uint256)
///
/// Nonce layout:
///
///     wordIndex = nonce / 256
///     bitIndex  = nonce % 256
///
/// The bit operations are intentionally implemented in Yul.
///
/// A consuming contract can declare:
///
///     mapping(uint256 => uint256) private _processedNonces;
///
/// and then use:
///
///     NonceBitmap.markProcessed(_processedNonces, nonce);
///
/// A nonce can only be marked once. Attempting to process an already
/// marked nonce reverts with {AlreadyProcessed}.
library NonceBitmap {
    // =============================================================
    //                            ERRORS
    // =============================================================

    /// @notice Thrown when attempting to process a nonce more than once.
    /// @param nonce The nonce that was already processed.
    error AlreadyProcessed(uint256 nonce);

    // =============================================================
    //                         BIT LOCATION
    // =============================================================

    /// @notice Returns the storage word and bit position for a nonce.
    /// @param nonce Message sequence nonce.
    /// @return wordIndex Index of the 256-bit storage word.
    /// @return bitIndex Bit position within the word, from 0 to 255.
    function locate(
        uint256 nonce
    ) internal pure returns (uint256 wordIndex, uint256 bitIndex) {
        // Division and modulo by 256 are compiled efficiently by Solidity.
        wordIndex = nonce / 256;
        bitIndex = nonce % 256;
    }

    // =============================================================
    //                         READ OPERATIONS
    // =============================================================

    /// @notice Checks whether a nonce has already been processed.
    /// @param bitmap Replay-protection bitmap.
    /// @param nonce Message sequence nonce.
    /// @return processed True when the nonce's bit is set.
    function isProcessed(
        mapping(uint256 => uint256) storage bitmap,
        uint256 nonce
    ) internal view returns (bool processed) {
        (uint256 wordIndex, uint256 bitIndex) = locate(nonce);
        uint256 word = bitmap[wordIndex];

        assembly {
            // Shift the target bit into position zero, then mask it.
            processed := and(shr(bitIndex, word), 1)
        }
    }

    // =============================================================
    //                       WRITE OPERATIONS
    // =============================================================

    /// @notice Marks a nonce as processed.
    /// @dev Reverts if the nonce has already been marked.
    ///
    /// The existing word is loaded once, checked once, updated once,
    /// and written back once.
    ///
    /// @param bitmap Replay-protection bitmap.
    /// @param nonce Message sequence nonce.
    function markProcessed(
        mapping(uint256 => uint256) storage bitmap,
        uint256 nonce
    ) internal {
        (uint256 wordIndex, uint256 bitIndex) = locate(nonce);

        uint256 word = bitmap[wordIndex];

        bool alreadyProcessed;

        assembly {
            // Extract the target bit.
            alreadyProcessed := and(shr(bitIndex, word), 1)
        }

        if (alreadyProcessed) {
            revert AlreadyProcessed(nonce);
        }

        uint256 updatedWord;

        assembly {
            // Set exactly one bit while preserving every other bit.
            updatedWord := or(word, shl(bitIndex, 1))
        }

        bitmap[wordIndex] = updatedWord;
    }
}

/// @title NonceBitmapWrapper
/// @notice Test and gas-benchmark wrapper for {NonceBitmap}.
/// @dev This contract intentionally exposes the library's operations so
///      unit tests and gas benchmarks can validate bitmap behavior directly.
contract NonceBitmapWrapper {
    using NonceBitmap for mapping(uint256 => uint256);

    // =============================================================
    //                            STORAGE
    // =============================================================

    /// @notice Packed replay-protection bitmap.
    /// @dev Each storage word contains flags for 256 consecutive nonces.
    mapping(uint256 => uint256) public bitmap;

    // =============================================================
    //                          READ METHODS
    // =============================================================

    /// @notice Returns whether a nonce has already been processed.
    function isProcessed(uint256 nonce) external view returns (bool) {
        return bitmap.isProcessed(nonce);
    }

    /// @notice Returns the raw 256-bit word for a word index.
    function getWord(uint256 wordIndex) external view returns (uint256) {
        return bitmap[wordIndex];
    }

    /// @notice Returns the word and bit position corresponding to a nonce.
    function locate(
        uint256 nonce
    ) external pure returns (uint256 wordIndex, uint256 bitIndex) {
        return NonceBitmap.locate(nonce);
    }

    // =============================================================
    //                         WRITE METHODS
    // =============================================================

    /// @notice Marks a nonce as processed.
    /// @dev Reverts with {NonceBitmap.AlreadyProcessed} when the nonce
    ///      has already been marked.
    function markProcessed(uint256 nonce) external {
        bitmap.markProcessed(nonce);
    }

    /// @notice Marks multiple nonces as processed.
    /// @dev Primarily intended for testing and gas benchmarking.
    ///      A repeated nonce causes the entire transaction to revert.
    function markProcessedBatch(
        uint256[] calldata nonces
    ) external {
        uint256 length = nonces.length;

        for (uint256 i; i < length; ) {
            bitmap.markProcessed(nonces[i]);

            unchecked {
                ++i;
            }
        }
    }
}
