// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {NonceSlotCalculator} from "../../contracts/utils/NonceSlotCalculator.sol";

/// @notice Test harness that exposes {NonceSlotCalculator} and lets the test
///         verify computed slots against the actual storage layout of an
///         on-chain nested mapping.
contract NonceSlotCalculatorHarness {
    /// @dev The nested nonce mapping lives at storage slot 0.
    ///      This is the same layout the library targets by default.
    mapping(uint256 => mapping(uint256 => bool)) public nonces;

    /// @notice Returns the slot computed by {NonceSlotCalculator.slotForNonce}.
    function computedSlot(
        uint256 chainId,
        uint256 nonce
    ) external pure returns (bytes32) {
        return NonceSlotCalculator.slotForNonce(chainId, nonce);
    }

    /// @notice Returns the slot computed by {NonceSlotCalculator.slotForNonceAt}.
    function computedSlotAt(
        uint256 chainId,
        uint256 nonce,
        uint256 mappingSlot
    ) external pure returns (bytes32) {
        return NonceSlotCalculator.slotForNonceAt(chainId, nonce, mappingSlot);
    }

    /// @notice Writes `true` to `nonces[chainId][nonce]` and returns the
    ///         raw storage value at the slot the library calculated.
    function markAndRead(
        uint256 chainId,
        uint256 nonce
    ) external returns (bytes32 slot, bytes32 rawValue) {
        nonces[chainId][nonce] = true;
        slot = NonceSlotCalculator.slotForNonce(chainId, nonce);
        assembly {
            rawValue := sload(slot)
        }
    }
}
