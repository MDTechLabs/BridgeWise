// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CalldataSlicer
/// @notice Zero-copy slicer for dynamically sized calldata arrays.
/// @dev Solidity's `cd[start:end]` operator inserts implicit bounds checks
///      and, when the resulting slice is forwarded into a `memory` sub-routine,
///      copies the range into a freshly allocated dynamic buffer. This library
///      never allocates: it rewrites the `(offset, length)` pair that Solidity
///      uses to represent a calldata array and returns that pair as a typed
///      calldata slice, which can be passed straight into Yul verifier loops.
///
///      Nested ABI-encoded arrays (a `bytes` / `T[]` packed inside an outer
///      `bytes calldata` blob) are decoded with `calldataload` — first the
///      relative offset pointer, then the length word — so neither the offset
///      table nor the payload is ever copied into memory.
library CalldataSlicer {
    /// @notice The requested range is not a subset of the source array, or an
    ///         ABI offset/length word would read past the enclosing buffer.
    error SliceOutOfBounds();

    /// @notice Returns `data[start:end]` as a calldata slice, without copying.
    /// @param data  Source byte array, already ABI-decoded as `bytes calldata`.
    /// @param start Inclusive start index, in bytes.
    /// @param end   Exclusive end index, in bytes.
    /// @return result Zero-copy view of the requested range.
    function slice(
        bytes calldata data,
        uint256 start,
        uint256 end
    ) internal pure returns (bytes calldata result) {
        bool oob;
        assembly ("memory-safe") {
            oob := or(gt(start, end), gt(end, data.length))
            // Always assign so the calldata return is defined even on the
            // revert path (the compiler cannot see through a later `revert`).
            result.offset := 0
            result.length := 0
            if iszero(oob) {
                result.offset := add(data.offset, start)
                result.length := sub(end, start)
            }
        }
        if (oob) revert SliceOutOfBounds();
    }

    /// @notice Returns `data[start:end]` as a calldata slice, without copying.
    /// @param data  Source word array (`bytes32[]`, ABI-decoded).
    /// @param start Inclusive start index, in elements.
    /// @param end   Exclusive end index, in elements.
    /// @return result Zero-copy view of the requested range.
    function slice(
        bytes32[] calldata data,
        uint256 start,
        uint256 end
    ) internal pure returns (bytes32[] calldata result) {
        uint256 dataOffset;
        uint256 dataLength;
        assembly ("memory-safe") {
            dataOffset := data.offset
            dataLength := data.length
        }
        (uint256 offset, uint256 length) = _sliceWordArray(
            dataOffset,
            dataLength,
            start,
            end
        );
        assembly ("memory-safe") {
            result.offset := offset
            result.length := length
        }
    }

    /// @notice Returns `data[start:end]` as a calldata slice, without copying.
    /// @param data  Source address array, ABI-decoded as `address[] calldata`.
    /// @param start Inclusive start index, in elements.
    /// @param end   Exclusive end index, in elements.
    /// @return result Zero-copy view of the requested range.
    function slice(
        address[] calldata data,
        uint256 start,
        uint256 end
    ) internal pure returns (address[] calldata result) {
        uint256 dataOffset;
        uint256 dataLength;
        assembly ("memory-safe") {
            dataOffset := data.offset
            dataLength := data.length
        }
        (uint256 offset, uint256 length) = _sliceWordArray(
            dataOffset,
            dataLength,
            start,
            end
        );
        assembly ("memory-safe") {
            result.offset := offset
            result.length := length
        }
    }

    /// @notice Loads one 32-byte word from a byte slice via `calldataload`.
    /// @param data       Source byte slice.
    /// @param byteOffset Offset from the start of `data`, in bytes. The 32-byte
    ///                   window `[byteOffset, byteOffset+32)` must lie inside
    ///                   `data`.
    /// @return word      The word at that calldata offset.
    function loadWord(
        bytes calldata data,
        uint256 byteOffset
    ) internal pure returns (bytes32 word) {
        bool oob;
        assembly ("memory-safe") {
            let tail := add(byteOffset, 0x20)
            oob := or(lt(tail, byteOffset), gt(tail, data.length))
            if iszero(oob) {
                word := calldataload(add(data.offset, byteOffset))
            }
        }
        if (oob) revert SliceOutOfBounds();
    }

    /// @notice Loads element `index` from a word array via `calldataload`.
    /// @param data  Source word array.
    /// @param index Element index. Reverts if `index >= data.length`.
    /// @return word The word at `data[index]`.
    function wordAt(
        bytes32[] calldata data,
        uint256 index
    ) internal pure returns (bytes32 word) {
        bool oob;
        assembly ("memory-safe") {
            oob := iszero(lt(index, data.length))
            if iszero(oob) {
                word := calldataload(add(data.offset, mul(index, 0x20)))
            }
        }
        if (oob) revert SliceOutOfBounds();
    }

    /// @notice Loads element `index` from an address array via `calldataload`.
    /// @param data  Source address array.
    /// @param index Element index. Reverts if `index >= data.length`.
    /// @return value The address at `data[index]`.
    function wordAt(
        address[] calldata data,
        uint256 index
    ) internal pure returns (address value) {
        bool oob;
        assembly ("memory-safe") {
            oob := iszero(lt(index, data.length))
            if iszero(oob) {
                value := and(
                    calldataload(add(data.offset, mul(index, 0x20))),
                    0xffffffffffffffffffffffffffffffffffffffff
                )
            }
        }
        if (oob) revert SliceOutOfBounds();
    }

    /// @notice Extracts a nested ABI-encoded `bytes` from `data` with no copy.
    /// @dev `data` is treated as the ABI encoding of a tuple of dynamic
    ///      values. `headOffset` is the byte offset *within* `data` of the
    ///      32-byte relative-offset head word for the field being extracted.
    ///
    ///      Layout (relative to `data.offset`):
    ///        `calldataload(headOffset)` → relative offset `rel`
    ///        `calldataload(rel)`        → byte length `len`
    ///        payload                    → `[rel+32, rel+32+len)`
    ///
    ///      Both the offset pointer and the length word are read with
    ///      `calldataload`. The returned slice points at the payload.
    /// @param data       Outer ABI-encoded buffer.
    /// @param headOffset Byte offset of the field's head word inside `data`.
    /// @return result    Zero-copy `bytes calldata` view of the nested payload.
    function extractBytes(
        bytes calldata data,
        uint256 headOffset
    ) internal pure returns (bytes calldata result) {
        (uint256 offset, uint256 length) = _extractDynamic(data, headOffset, false);
        assembly ("memory-safe") {
            result.offset := offset
            result.length := length
        }
    }

    /// @notice Extracts a nested ABI-encoded `bytes32[]` from `data` with no copy.
    /// @dev Same head/tail layout as {extractBytes}, except the length word is
    ///      an *element count* and the payload is `length * 32` bytes.
    /// @param data       Outer ABI-encoded buffer.
    /// @param headOffset Byte offset of the field's head word inside `data`.
    /// @return result    Zero-copy `bytes32[] calldata` view of the nested array.
    function extractWords(
        bytes calldata data,
        uint256 headOffset
    ) internal pure returns (bytes32[] calldata result) {
        (uint256 offset, uint256 length) = _extractDynamic(data, headOffset, true);
        assembly ("memory-safe") {
            result.offset := offset
            result.length := length
        }
    }

    /// @notice Returns the raw `(offset, length)` pointer pair for a byte slice.
    /// @dev Intended for Yul verifiers that consume absolute calldata offsets
    ///      rather than typed Solidity slices.
    /// @param data Source byte slice.
    /// @return offset Absolute calldata offset of the first payload byte.
    /// @return length Payload length in bytes.
    function pointers(
        bytes calldata data
    ) internal pure returns (uint256 offset, uint256 length) {
        assembly ("memory-safe") {
            offset := data.offset
            length := data.length
        }
    }

    /// @notice Returns the raw `(offset, length)` pointer pair for a word array.
    /// @param data Source word array.
    /// @return offset Absolute calldata offset of the first element.
    /// @return length Element count.
    function pointers(
        bytes32[] calldata data
    ) internal pure returns (uint256 offset, uint256 length) {
        assembly ("memory-safe") {
            offset := data.offset
            length := data.length
        }
    }

    /// @dev Shared word-array slicer. `dataOffset` / `dataLength` are the
    ///      Solidity calldata-slice fields of the source array. `length` in
    ///      the return pair is an element count, not a byte count.
    function _sliceWordArray(
        uint256 dataOffset,
        uint256 dataLength,
        uint256 start,
        uint256 end
    ) private pure returns (uint256 offset, uint256 length) {
        bool oob;
        assembly ("memory-safe") {
            oob := or(gt(start, end), gt(end, dataLength))
            if iszero(oob) {
                offset := add(dataOffset, mul(start, 0x20))
                length := sub(end, start)
            }
        }
        if (oob) revert SliceOutOfBounds();
    }

    /// @dev Walks one ABI dynamic-field head/tail pair inside `data`.
    ///      `asWords == true` treats the length word as an element count
    ///      (payload size `len * 32`); otherwise it is a byte length.
    function _extractDynamic(
        bytes calldata data,
        uint256 headOffset,
        bool asWords
    ) private pure returns (uint256 offset, uint256 length) {
        bool oob;
        assembly ("memory-safe") {
            let bound := data.length
            let base := data.offset

            // Head word `[headOffset, headOffset+32)` must lie inside `data`.
            let headEnd := add(headOffset, 0x20)
            oob := or(lt(headEnd, headOffset), gt(headEnd, bound))

            if iszero(oob) {
                // Relative offset pointer — first `calldataload`.
                let rel := calldataload(add(base, headOffset))

                // Length word `[rel, rel+32)` must lie inside `data`.
                let lenEnd := add(rel, 0x20)
                oob := or(lt(lenEnd, rel), gt(lenEnd, bound))

                if iszero(oob) {
                    // Length — second `calldataload`.
                    let len := calldataload(add(base, rel))

                    let payloadBytes := len
                    if asWords {
                        payloadBytes := mul(len, 0x20)
                        // Overflow: `len * 32` wrapped.
                        if iszero(eq(len, div(payloadBytes, 0x20))) {
                            oob := 1
                        }
                    }

                    if iszero(oob) {
                        let payloadEnd := add(lenEnd, payloadBytes)
                        oob := or(lt(payloadEnd, lenEnd), gt(payloadEnd, bound))
                        if iszero(oob) {
                            offset := add(add(base, rel), 0x20)
                            length := len
                        }
                    }
                }
            }
        }
        if (oob) revert SliceOutOfBounds();
    }
}
