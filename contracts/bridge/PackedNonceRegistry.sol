// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PackedNonceRegistry
/// @notice Bit-packs multiple per-destination-chain outbound nonce counters into
///         shared 256-bit storage words instead of giving every chain ID its own
///         full storage slot (as a plain `mapping(uint32 => uint64)` would).
/// @dev Packing layout:
///        - Each counter occupies 32 bits (`COUNTER_BITS`).
///        - 8 counters are packed per 256-bit storage word (`COUNTERS_PER_WORD`),
///          using the word's full width with no padding (8 * 32 == 256).
///        - `chainId` (uint32) maps to a word via `wordIndex = chainId / 8` and to
///          a position within that word via `subSlot = chainId % 8`.
///        - Within a word, `subSlot` occupies bits [subSlot*32, subSlot*32+32).
///
///      32 bits per counter allows up to 4,294,967,295 outbound messages per
///      destination chain before overflow. That is vastly more than any real
///      bridge deployment will dispatch to a single chain over its operational
///      lifetime (at one message per second it would take ~136 years to
///      exhaust), so the reduced width is an acceptable, deliberate tradeoff in
///      exchange for 8x fewer storage words and shared, mostly-warm SSTOREs
///      across chains that pack into the same word. An explicit overflow guard
///      (`NonceOverflow`) still reverts rather than silently wrapping, so the
///      tradeoff fails safely if it is ever actually approached.
///
///      Getters/increments are implemented with inline Yul (`sload`/`sstore` +
///      `shr`/`shl`/`and`/`not` bit-shift and mask operators) around the target
///      counter's bit field, matching the low-level style established by
///      `contracts/crypto/BitmaskVerifierYul.sol`. The `wordIndex`/`subSlot`
///      arithmetic and the mapping-slot lookup stay in plain Solidity for
///      readability; only the bit-packed read/modify/write of the storage word
///      itself is done in assembly.
///
///      This is delivered as a library operating on a caller-owned `Layout`
///      storage struct (the same "library + thin wrapper contract" pattern
///      `BitmaskVerifierYul` uses) so any contract can adopt packed nonces by
///      declaring a single `PackedNonceRegistry.Layout` state variable, without
///      requiring changes to already-tested contracts such as
///      `contracts/core/BridgeSender.sol`.
library PackedNonceRegistry {
    /// @dev Number of bits allocated to each per-chain nonce counter.
    uint256 internal constant COUNTER_BITS = 32;

    /// @dev Number of 32-bit counters packed into a single 256-bit storage word.
    uint256 internal constant COUNTERS_PER_WORD = 8; // 256 / 32

    /// @dev Mask isolating a single 32-bit counter field once shifted into place.
    uint256 private constant COUNTER_MASK = 0xFFFFFFFF;

    /// @dev Largest representable counter value; incrementing past this reverts.
    uint32 private constant MAX_COUNTER = type(uint32).max;

    /// @notice Thrown when incrementing a chain's nonce would overflow its 32-bit field.
    error NonceOverflow(uint32 chainId);

    /// @notice Storage layout housing every packed nonce word.
    /// @dev Consuming contracts declare exactly one state variable of this type
    ///      and pass it by storage reference into the library's functions.
    struct Layout {
        mapping(uint256 => bytes32) words;
    }

    /// @dev Splits a chain ID into its packed-word index and its 32-bit sub-slot
    ///      position within that word.
    function _locate(uint32 chainId) private pure returns (uint256 wordIndex, uint256 subSlot) {
        wordIndex = uint256(chainId) >> 3; // chainId / 8
        subSlot = uint256(chainId) & 7; // chainId % 8
    }

    /// @dev Computes the actual storage slot backing `self.words[wordIndex]`,
    ///      reproducing Solidity's own `keccak256(key . mappingSlot)` mapping
    ///      slot derivation so the assembly reads/writes land on the exact slot
    ///      the `words` mapping already occupies.
    function _wordSlot(Layout storage self, uint256 wordIndex) private view returns (bytes32 slot) {
        mapping(uint256 => bytes32) storage words = self.words;
        assembly {
            mstore(0x00, wordIndex)
            mstore(0x20, words.slot)
            slot := keccak256(0x00, 0x40)
        }
    }

    /// @dev Loads the word at `wordSlot` (one SLOAD) and extracts its
    ///      `subSlot`-th packed 32-bit counter. Returns the raw word alongside
    ///      the extracted counter so a subsequent write can reuse it without
    ///      re-reading storage.
    function _readCounter(bytes32 wordSlot, uint256 subSlot) private view returns (uint32 counter, bytes32 word) {
        assembly {
            word := sload(wordSlot)
            let shift := mul(subSlot, 32)
            counter := and(shr(shift, word), 0xFFFFFFFF)
        }
    }

    /// @dev Rewrites just the `subSlot`-th 32-bit field of an already-loaded
    ///      `word` to `newValue` and persists it with a single SSTORE, leaving
    ///      every other packed counter in that word untouched. Takes the old
    ///      word as an argument (rather than re-`sload`-ing it) so a
    ///      read-then-write sequence costs exactly one SLOAD + one SSTORE.
    function _writeCounter(bytes32 wordSlot, bytes32 word, uint256 subSlot, uint32 newValue) private {
        assembly {
            let shift := mul(subSlot, 32)
            let shiftedMask := shl(shift, 0xFFFFFFFF)
            let cleared := and(word, not(shiftedMask))
            let updated := or(cleared, shl(shift, newValue))
            sstore(wordSlot, updated)
        }
    }

    /// @notice Read the current outbound nonce for `chainId` without mutating state.
    function getNonce(Layout storage self, uint32 chainId) internal view returns (uint32 counter) {
        (uint256 wordIndex, uint256 subSlot) = _locate(chainId);
        (counter, ) = _readCounter(_wordSlot(self, wordIndex), subSlot);
    }

    /// @notice Assigns the next outbound nonce for `chainId` and persists the
    ///         incremented counter back into its packed word.
    /// @dev Returns the *pre-increment* value, i.e. the nonce assigned to the
    ///      message being dispatched right now (storage is advanced to
    ///      `nonce + 1` for the next call) — mirroring the existing
    ///      `BridgeSender.dispatchMessage` nonce-assignment convention.
    ///      Reads the packed word exactly once (via `_readCounter`) and reuses
    ///      it for the write (via `_writeCounter`), so the whole
    ///      read-modify-write costs exactly one SLOAD + one SSTORE.
    /// @return nonce The nonce assigned to this dispatch.
    function incrementNonce(Layout storage self, uint32 chainId) internal returns (uint32 nonce) {
        (uint256 wordIndex, uint256 subSlot) = _locate(chainId);
        bytes32 wordSlot = _wordSlot(self, wordIndex);

        bytes32 word;
        (nonce, word) = _readCounter(wordSlot, subSlot);
        if (nonce == MAX_COUNTER) revert NonceOverflow(chainId);

        _writeCounter(wordSlot, word, subSlot, nonce + 1);
    }
}

/// @notice Thin wrapper contract exposing `PackedNonceRegistry` for testing and
///         direct on-chain use, matching the library+wrapper pattern
///         established by `BitmaskVerifierYul`/`BitmaskVerifierYulWrapper`.
contract PackedNonceRegistryWrapper {
    using PackedNonceRegistry for PackedNonceRegistry.Layout;

    /// @dev Number of 32-bit counters packed per 256-bit storage word (informational).
    uint256 public constant COUNTERS_PER_WORD = 8;

    PackedNonceRegistry.Layout private nonces;

    /// @notice Read the current outbound nonce for `chainId`.
    function getNonce(uint32 chainId) external view returns (uint32) {
        return nonces.getNonce(chainId);
    }

    /// @notice Assign and persist the next outbound nonce for `chainId`.
    /// @return nonce The nonce assigned to this call (pre-increment value).
    function incrementNonce(uint32 chainId) external returns (uint32 nonce) {
        return nonces.incrementNonce(chainId);
    }

    /// @notice Assign and persist the next outbound nonce for each chain ID in
    ///         `chainIds`, in a single transaction.
    /// @dev Demonstrates the packing scheme's sustained advantage: chain IDs
    ///      that share a packed word only pay a cold SLOAD/SSTORE for the
    ///      first one touched in the batch — the rest hit an already-warm
    ///      word within the same transaction (EIP-2929 access lists are
    ///      per-transaction), unlike one-slot-per-chain storage where every
    ///      chain ID is a distinct address and therefore separately cold.
    /// @return assigned The pre-increment nonce assigned to each entry, in order.
    function incrementMany(uint32[] calldata chainIds) external returns (uint32[] memory assigned) {
        assigned = new uint32[](chainIds.length);
        for (uint256 i = 0; i < chainIds.length; i++) {
            assigned[i] = nonces.incrementNonce(chainIds[i]);
        }
    }
}

/// @notice Naive baseline used only as a gas-comparison control in
///         `test/bridge/PackedNonceRegistry.test.ts`: one full 256-bit storage
///         slot per chain ID, exactly the pattern described in issue #871
///         (`mapping(uint32 => uint256) public chainNonces`) that
///         `PackedNonceRegistry` replaces. Not used anywhere else in the codebase.
contract NaiveNonceCounter {
    mapping(uint32 => uint256) public chainNonces;

    function incrementNonce(uint32 chainId) external returns (uint256 nonce) {
        nonce = chainNonces[chainId];
        chainNonces[chainId] = nonce + 1;
    }

    /// @notice Batch counterpart to `PackedNonceRegistryWrapper.incrementMany`,
    ///         used only for the same-transaction gas comparison: here every
    ///         chain ID is its own storage slot, so batching confers no
    ///         shared-warmth benefit the way packed sub-slots of one word do.
    function incrementMany(uint32[] calldata chainIds) external returns (uint256[] memory assigned) {
        assigned = new uint256[](chainIds.length);
        for (uint256 i = 0; i < chainIds.length; i++) {
            uint256 nonce = chainNonces[chainIds[i]];
            chainNonces[chainIds[i]] = nonce + 1;
            assigned[i] = nonce;
        }
    }
}
