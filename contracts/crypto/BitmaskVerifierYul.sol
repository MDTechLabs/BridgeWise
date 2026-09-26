// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BitmaskVerifierYul
/// @notice Gas-optimized Yul/Assembly validator signature verification engine.
///         Parses packed bitmasks to verify k-of-n threshold consensus signatures
///         with minimal calldata expansion.
/// @dev Ingests a packed byte array of concatenated ECDSA signatures [v, r, s]
///      and a uint256 validator bitmask. Extracts expected validator public keys
///      based on set bit indices and verifies threshold quorum using ecrecover
///      in Yul inline assembly loops.
library BitmaskVerifierYul {
    /// @notice Verify that at least `threshold` signatures in `packedSignatures`
    ///         match validators indicated by `validatorBitmask`.
    /// @param packedSignatures Concatenated [v(1), r(32), s(32)] signatures (65 bytes each).
    /// @param validatorBitmask  Bitmask where each set bit corresponds to a validator index.
    /// @param validatorAddresses Array of all validator addresses (indexed by bit position).
    /// @param threshold         Minimum number of valid signatures required.
    /// @return True if k-of-n threshold is met.
    function verifyThreshold(
        bytes calldata packedSignatures,
        uint256 validatorBitmask,
        address[] calldata validatorAddresses,
        uint256 threshold
    ) internal view returns (bool) {
        uint256 sigCount = packedSignatures.length / 65;
        uint256 validCount = 0;
        uint256 mask = validatorBitmask;

        for (uint256 i = 0; i < sigCount; ) {
            // Extract signature components
            bytes32 r;
            bytes32 s;
            uint8 v;

            assembly {
                let sigOffset := add(packedSignatures.offset, mul(i, 65))
                r := calldataload(sigOffset)
                s := calldataload(add(sigOffset, 32))
                v := byte(0, calldataload(add(sigOffset, 64)))
            }

            // Compute signer address using ecrecover precompile (address 0x01)
            bytes32 ethSignedMessageHash = keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encodePacked(i)))
            );

            address signer;
            assembly {
                mstore(0x00, ethSignedMessageHash)
                mstore(0x20, v)
                mstore(0x40, r)
                mstore(0x60, s)
                // ecrecover precompile at address 0x01
                let success := staticcall(gas(), 0x01, 0x00, 0x80, 0x80, 0x20)
                signer := mload(0x80)
                // If staticcall failed, signer will be address(0)
            }

            // Check if signer is in the validator set via bitmask
            for (uint256 j = 0; j < validatorAddresses.length; ) {
                if (validatorAddresses[j] == signer && (mask & (uint256(1) << j)) != 0) {
                    validCount++;
                    // Clear the bit so each validator can only match once
                    mask &= ~(uint256(1) << j);
                    break;
                }
                unchecked { ++j; }
            }

            unchecked { ++i; }
        }

        return validCount >= threshold;
    }

    /// @notice Count the number of set bits in a bitmask (number of active validators).
    /// @param bitmask The validator bitmask.
    /// @return count Number of set bits.
    function countSetBits(uint256 bitmask) internal pure returns (uint256 count) {
        assembly {
            let x := bitmask
            for { } gt(x, 0) {} {
                x := and(x, sub(x, 1))
                count := add(count, 1)
            }
        }
    }

    /// @notice Check if a specific bit index is set in the bitmask.
    /// @param bitmask The validator bitmask.
    /// @param index   The bit position to check.
    /// @return True if the bit is set.
    function isBitSet(uint256 bitmask, uint256 index) internal pure returns (bool) {
        return (bitmask & (uint256(1) << index)) != 0;
    }
}

/// @dev Wrapper contract to expose the library for testing.
contract BitmaskVerifierYulWrapper {
    function verifyThreshold(
        bytes calldata packedSignatures,
        uint256 validatorBitmask,
        address[] calldata validatorAddresses,
        uint256 threshold
    ) external view returns (bool) {
        return BitmaskVerifierYul.verifyThreshold(
            packedSignatures, validatorBitmask, validatorAddresses, threshold
        );
    }

    function countSetBits(uint256 bitmask) external pure returns (uint256) {
        return BitmaskVerifierYul.countSetBits(bitmask);
    }

    function isBitSet(uint256 bitmask, uint256 index) external pure returns (bool) {
        return BitmaskVerifierYul.isBitSet(bitmask, index);
    }
}
