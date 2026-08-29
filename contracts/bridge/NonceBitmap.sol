// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title NonceBitmap
/// @notice Gas-optimized replay-protection library for cross-chain message sequence
///         nonces. Instead of setting a fresh 32-byte storage slot per processed
///         message (`mapping(bytes32 => bool)`, ~20,000 cold-write gas every time),
///         this packs 256 processed-nonce flags into a single `uint256` storage word
///         (`mapping(uint256 => uint256)`), so sequential nonces that land in the same
///         word only pay the cold-write cost once per 256 messages.
/// @dev Word index = `nonce / 256`, bit index = `nonce % 256`. The actual bit read and
///      bit set both happen inside `assembly` blocks using `shr`/`shl`/`and`/`or`, per
///      the issue's requirement that bit manipulation happen in Yul rather than via
///      plain Solidity `|=` on a `uint256`.
///
///      Any contract can adopt replay protection by declaring one
///      `mapping(uint256 => uint256) private _processedNonces;` state variable and
///      calling `NonceBitmap.markProcessed(_processedNonces, nonce)` — mirroring the
///      `BitmaskVerifierYul` library pattern already used in this codebase.
library NonceBitmap {
    /// @notice Thrown by `markProcessed` when `nonce` has already been marked processed.
    error AlreadyProcessed(uint256 nonce);

    /// @notice Compute the storage word index and in-word bit index for a nonce.
    /// @param nonce The message sequence nonce.
    /// @return wordIndex The key into the `mapping(uint256 => uint256)` bitmap.
    /// @return bitIndex  The bit position (0-255) within that word.
    function locate(uint256 nonce) internal pure returns (uint256 wordIndex, uint256 bitIndex) {
        wordIndex = nonce / 256;
        bitIndex = nonce % 256;
    }

    /// @notice Check whether `nonce` has already been marked processed.
    /// @param bitmap The caller's bitmap storage mapping.
    /// @param nonce  The message sequence nonce to check.
    /// @return processed True if the bit for `nonce` is already set.
    function isProcessed(mapping(uint256 => uint256) storage bitmap, uint256 nonce)
        internal
        view
        returns (bool processed)
    {
        (uint256 wordIndex, uint256 bitIndex) = locate(nonce);
        uint256 word = bitmap[wordIndex];

        assembly {
            processed := and(shr(bitIndex, word), 1)
        }
    }

    /// @notice Atomically check-and-set: mark `nonce` as processed, reverting if it was
    ///         already marked. This is the primary replay-guard entry point — a single
    ///         call that closes the check-then-set race a separate read + write pair
    ///         would otherwise leave open between two external calls.
    /// @param bitmap The caller's bitmap storage mapping.
    /// @param nonce  The message sequence nonce to mark processed.
    function markProcessed(mapping(uint256 => uint256) storage bitmap, uint256 nonce) internal {
        (uint256 wordIndex, uint256 bitIndex) = locate(nonce);
        uint256 word = bitmap[wordIndex];

        bool alreadySet;
        assembly {
            alreadySet := and(shr(bitIndex, word), 1)
        }
        if (alreadySet) revert AlreadyProcessed(nonce);

        uint256 updated;
        assembly {
            updated := or(word, shl(bitIndex, 1))
        }
        bitmap[wordIndex] = updated;
    }
}

/// @dev Thin wrapper contract to expose the library for direct testing, exactly like
///      `BitmaskVerifierYulWrapper` for `BitmaskVerifierYul`.
contract NonceBitmapWrapper {
    using NonceBitmap for mapping(uint256 => uint256);

    /// @notice The packed replay-protection bitmap: wordIndex => 256-bit word of flags.
    mapping(uint256 => uint256) public bitmap;

    /// @notice Check whether `nonce` has already been marked processed.
    function isProcessed(uint256 nonce) external view returns (bool) {
        return bitmap.isProcessed(nonce);
    }

    /// @notice Mark `nonce` processed, reverting with `NonceBitmap.AlreadyProcessed` if
    ///         it was already marked.
    function markProcessed(uint256 nonce) external {
        bitmap.markProcessed(nonce);
    }

    /// @notice Mark a batch of nonces processed in a single call, so gas comparisons
    ///         against a naive per-nonce mapping can isolate the storage bookkeeping
    ///         cost from fixed per-transaction overhead (21,000 gas base cost, etc.)
    ///         that both approaches would pay identically anyway.
    function markProcessedBatch(uint256[] calldata nonces) external {
        for (uint256 i = 0; i < nonces.length; i++) {
            bitmap.markProcessed(nonces[i]);
        }
    }

    /// @notice Read the raw storage word backing a given word index.
    function getWord(uint256 wordIndex) external view returns (uint256) {
        return bitmap[wordIndex];
    }

    /// @notice Expose the wordIndex/bitIndex split for a given nonce.
    function locate(uint256 nonce) external pure returns (uint256 wordIndex, uint256 bitIndex) {
        return NonceBitmap.locate(nonce);
    }
}
