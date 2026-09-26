// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CalldataSlicer} from "../../contracts/utils/CalldataSlicer.sol";

/// @notice Test harness exposing {CalldataSlicer} and a stub verifier that
///         consumes zero-copy calldata slices via `calldataload`.
contract CalldataSlicerHarness {
    error SliceOutOfBounds();

    /// @notice Echoes `data[start:end]` through the zero-copy slicer. The
    ///         ABI encoder copies the result for the external return; the
    ///         library itself does not allocate.
    function echoBytes(
        bytes calldata data,
        uint256 start,
        uint256 end
    ) external pure returns (bytes memory) {
        return CalldataSlicer.slice(data, start, end);
    }

    /// @notice Echoes `data[start:end]` for a word array.
    function echoWords(
        bytes32[] calldata data,
        uint256 start,
        uint256 end
    ) external pure returns (bytes32[] memory) {
        return CalldataSlicer.slice(data, start, end);
    }

    /// @notice Echoes `data[start:end]` for an address array.
    function echoAddresses(
        address[] calldata data,
        uint256 start,
        uint256 end
    ) external pure returns (address[] memory) {
        return CalldataSlicer.slice(data, start, end);
    }

    /// @notice Returns the absolute calldata offset and byte length of a slice.
    function sliceBytesPointers(
        bytes calldata data,
        uint256 start,
        uint256 end
    ) external pure returns (uint256 offset, uint256 length, uint256 sourceOffset) {
        bytes calldata sliced = CalldataSlicer.slice(data, start, end);
        assembly {
            sourceOffset := data.offset
        }
        (offset, length) = CalldataSlicer.pointers(sliced);
    }

    /// @notice Returns the absolute calldata offset and element count of a slice.
    function sliceWordsPointers(
        bytes32[] calldata data,
        uint256 start,
        uint256 end
    ) external pure returns (uint256 offset, uint256 length, uint256 sourceOffset) {
        bytes32[] calldata sliced = CalldataSlicer.slice(data, start, end);
        assembly {
            sourceOffset := data.offset
        }
        (offset, length) = CalldataSlicer.pointers(sliced);
    }

    /// @notice Loads a 32-byte window out of a byte slice.
    function loadWord(
        bytes calldata data,
        uint256 byteOffset
    ) external pure returns (bytes32) {
        return CalldataSlicer.loadWord(data, byteOffset);
    }

    /// @notice Loads one element of a sliced word array via `calldataload`.
    function wordAtSlice(
        bytes32[] calldata data,
        uint256 start,
        uint256 end,
        uint256 index
    ) external pure returns (bytes32) {
        return CalldataSlicer.wordAt(CalldataSlicer.slice(data, start, end), index);
    }

    /// @notice Loads one element of a sliced address array via `calldataload`.
    function addressAtSlice(
        address[] calldata data,
        uint256 start,
        uint256 end,
        uint256 index
    ) external pure returns (address) {
        return CalldataSlicer.wordAt(CalldataSlicer.slice(data, start, end), index);
    }

    /// @notice Extracts a nested ABI-encoded `bytes` and echoes it.
    function echoExtractedBytes(
        bytes calldata data,
        uint256 headOffset
    ) external pure returns (bytes memory) {
        return CalldataSlicer.extractBytes(data, headOffset);
    }

    /// @notice Extracts a nested ABI-encoded `bytes32[]` and echoes it.
    function echoExtractedWords(
        bytes calldata data,
        uint256 headOffset
    ) external pure returns (bytes32[] memory) {
        return CalldataSlicer.extractWords(data, headOffset);
    }

    /// @notice Pointer pair for a nested `bytes` extracted via `calldataload`.
    function extractedBytesPointers(
        bytes calldata data,
        uint256 headOffset
    ) external pure returns (uint256 offset, uint256 length) {
        return CalldataSlicer.pointers(CalldataSlicer.extractBytes(data, headOffset));
    }

    /// @notice Snapshots the free-memory pointer around a bytes slice.
    function freeMemAfterBytesSlice(
        bytes calldata data,
        uint256 start,
        uint256 end
    ) external pure returns (uint256 before, uint256 after_, uint256 offset) {
        assembly {
            before := mload(0x40)
        }
        bytes calldata sliced = CalldataSlicer.slice(data, start, end);
        assembly {
            offset := sliced.offset
            after_ := mload(0x40)
        }
    }

    /// @notice Snapshots the free-memory pointer around a nested extract.
    function freeMemAfterExtract(
        bytes calldata data,
        uint256 headOffset
    ) external pure returns (uint256 before, uint256 after_, uint256 offset) {
        assembly {
            before := mload(0x40)
        }
        bytes calldata extracted = CalldataSlicer.extractBytes(data, headOffset);
        assembly {
            offset := extracted.offset
            after_ := mload(0x40)
        }
    }

    /// @notice Passes a zero-copy word-array slice into a Yul verifier stub
    ///         that XOR-reduces elements with `calldataload`.
    function xorSlice(
        bytes32[] calldata data,
        uint256 start,
        uint256 end
    ) external pure returns (bytes32) {
        return _xorVerifier(CalldataSlicer.slice(data, start, end));
    }

    /// @notice Passes a nested word array extracted from `data` into the same
    ///         verifier stub, still without building a memory array.
    function xorExtracted(
        bytes calldata data,
        uint256 headOffset
    ) external pure returns (bytes32) {
        return _xorVerifier(CalldataSlicer.extractWords(data, headOffset));
    }

    /// @dev Low-level verifier logic: walks `words` entirely through the
    ///      calldata pointer the slicer handed over. No dynamic buffer is
    ///      allocated for the array itself.
    function _xorVerifier(bytes32[] calldata words) private pure returns (bytes32 acc) {
        uint256 n = words.length;
        for (uint256 i; i < n; ) {
            acc ^= CalldataSlicer.wordAt(words, i);
            unchecked {
                ++i;
            }
        }
    }
}
