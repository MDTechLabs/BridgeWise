// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title YulMultiSigVerifier
/// @notice Gas-optimized Yul/Assembly multi-signature quorum verification engine.
///         Iterates over validator signature arrays directly in calldata,
///         without dynamic ABI decoding, and enforces a strict-ascending
///         recovered-signer order to simultaneously prove signature ordering
///         and reject duplicate signers.
/// @dev Distinct from `BitmaskVerifierYul`: that contract tracks which
///      validators have already matched via a `uint256` bitmask (clearing a
///      bit once consumed). This contract instead requires the CALLER to
///      supply signatures pre-sorted so that recovered signer addresses are
///      strictly increasing (`recovered > lastSigner`). That single check
///      is sufficient to reject both out-of-order submissions and duplicate
///      signatures (a repeated address can never satisfy a strict `>`
///      comparison against itself), with no bitmask/set bookkeeping needed.
///      Reference validator membership is checked against a caller-supplied
///      `sortedValidators` calldata array (also expected sorted ascending)
///      using binary search, since it is sorted.
library YulMultiSigVerifier {
    /// @notice `packedSignatures.length` is not a multiple of 65 bytes.
    error InvalidSignatureLength();

    /// @notice The signature at `index` failed to recover a valid (non-zero) address.
    error InvalidSignature(uint256 index);

    /// @notice The signer recovered at `index` is not strictly greater than the
    ///         previously recovered signer, i.e. the signatures were not
    ///         supplied in strictly-ascending signer-address order. This is
    ///         also the mechanism that rejects an outright duplicate
    ///         signature/signer, since a repeated address cannot be strictly
    ///         greater than itself.
    error UnsortedOrDuplicateSignature(uint256 index);

    /// @notice Fewer than `threshold` recovered signers matched the reference
    ///         validator set.
    error QuorumNotMet(uint256 validCount, uint256 threshold);

    /// @notice Verify that at least `threshold` signatures in `packedSignatures`
    ///         recover to distinct, strictly-ordered addresses that belong to
    ///         `sortedValidators`.
    /// @param messageHash        The raw (unprefixed) message hash that each
    ///                            validator signed via the standard
    ///                            `\x19Ethereum Signed Message:\n32` prefix.
    /// @param packedSignatures   Concatenated [r(32), s(32), v(1)] tuples,
    ///                           65 bytes per signature, read directly from
    ///                           calldata (no memory array is ever built).
    /// @param sortedValidators   Reference validator set, sorted ascending by
    ///                           address, supplied as a calldata array so
    ///                           membership can be checked via binary search
    ///                           without copying it into memory.
    /// @param threshold          Minimum number of valid, sorted, distinct
    ///                           validator signatures required.
    /// @return True if the quorum threshold is met.
    function verifyQuorum(
        bytes32 messageHash,
        bytes calldata packedSignatures,
        address[] calldata sortedValidators,
        uint256 threshold
    ) internal view returns (bool) {
        if (packedSignatures.length % 65 != 0) revert InvalidSignatureLength();
        uint256 sigCount = packedSignatures.length / 65;

        // Computed once, outside the loop: every signature is over the same
        // message, so there is nothing to recompute per-iteration (unlike a
        // per-index challenge scheme).
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        address lastSigner = address(0);
        uint256 validCount = 0;

        // The ecrecover scratch-space trick below deliberately writes into
        // 0x00-0x80, which OVERLAPS Solidity's reserved free-memory-pointer
        // slot at 0x40. If left clobbered, every later Solidity-level
        // memory operation in this call (ABI-encoding a custom error on
        // revert, or ABI-encoding the final `bool` return value) would read
        // a corrupted pointer and attempt a huge, gas-exhausting memory
        // expansion. We snapshot the genuine free-memory pointer once,
        // before the loop, and restore it after every scratch-space use so
        // the rest of the function keeps behaving normally.
        uint256 freeMemPtr;
        assembly {
            freeMemPtr := mload(0x40)
        }

        for (uint256 i = 0; i < sigCount; ) {
            bytes32 r;
            bytes32 s;
            uint8 v;

            assembly {
                // 65 bytes per signature: r(32) || s(32) || v(1).
                let sigOffset := add(packedSignatures.offset, mul(i, 65))
                r := calldataload(sigOffset)
                s := calldataload(add(sigOffset, 32))
                v := byte(0, calldataload(add(sigOffset, 64)))
            }

            address signer;
            assembly {
                // Scratch space layout for the ecrecover precompile call:
                //   0x00: hash, 0x20: v, 0x40: r, 0x60: s -> input (0x00..0x80)
                //   0x80: recovered address                -> output (0x80..0xa0)
                // Every iteration reuses these same fixed offsets, so memory
                // is only ever expanded to 0xa0 once (on the first
                // iteration) and never grows again as the loop continues —
                // this is what gives zero incremental memory-expansion cost
                // per additional signature.
                mstore(0x00, ethSignedMessageHash)
                mstore(0x20, v)
                mstore(0x40, r)
                mstore(0x60, s)
                let success := staticcall(gas(), 0x01, 0x00, 0x80, 0x80, 0x20)
                signer := mload(0x80)
                if iszero(success) { signer := 0 }
                // Restore the free-memory pointer we just overwrote via
                // `mstore(0x40, r)` above.
                mstore(0x40, freeMemPtr)
            }

            if (signer == address(0)) revert InvalidSignature(i);

            // Strict ascending check: simultaneously enforces sort order and
            // rejects duplicates (a repeated signer can't be > itself).
            if (signer <= lastSigner) revert UnsortedOrDuplicateSignature(i);
            lastSigner = signer;

            if (_isValidator(sortedValidators, signer)) {
                unchecked { ++validCount; }
            }

            unchecked { ++i; }
        }

        if (validCount < threshold) revert QuorumNotMet(validCount, threshold);
        return true;
    }

    /// @dev Binary search over `sortedValidators` (assumed sorted ascending
    ///      by the caller, as documented on `verifyQuorum`). Reads elements
    ///      directly out of calldata; no copy into memory is made.
    function _isValidator(address[] calldata sortedValidators, address signer)
        private
        pure
        returns (bool)
    {
        uint256 lo = 0;
        uint256 hi = sortedValidators.length;

        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            address candidate = sortedValidators[mid];
            if (candidate == signer) {
                return true;
            }
            if (candidate < signer) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }

        return false;
    }
}

/// @dev Wrapper contract to expose the library for testing.
contract YulMultiSigVerifierWrapper {
    function verifyQuorum(
        bytes32 messageHash,
        bytes calldata packedSignatures,
        address[] calldata sortedValidators,
        uint256 threshold
    ) external view returns (bool) {
        return YulMultiSigVerifier.verifyQuorum(
            messageHash, packedSignatures, sortedValidators, threshold
        );
    }
}
