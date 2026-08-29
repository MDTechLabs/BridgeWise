// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title YulGroth16Verifier
/// @notice Gas-optimized Groth16 proof verification over BN254 (alt_bn128).
///         Proof points, the verifying key and the accumulated public-input
///         commitment are staged directly into a single contiguous memory
///         buffer and handed to the pairing precompile at `0x08`, avoiding the
///         stack shuffling and repeated memory allocation that a high-level
///         Solidity verifier emits when assembling the same call.
///
/// @dev Verification checks the standard Groth16 equation
///
///          e(A, B) == e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
///
///      rearranged into the single product the pairing precompile evaluates:
///
///          e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
///
///      where `vk_x = IC[0] + sum(input[i] * IC[i+1])`.
///
///      All points are encoded exactly as EIP-197 expects. G1 points are
///      `(x, y)`. G2 coordinates live in Fp2 and are serialised
///      imaginary-part-first, i.e. `(x_c1, x_c0, y_c1, y_c0)`.
library YulGroth16Verifier {
    /// @dev BN254 base field modulus. Used to negate A.
    uint256 internal constant FIELD_MODULUS =
        21888242871839275222246405745257275088696311157297823662689037894645226208583;

    /// @dev BN254 scalar field order. Public inputs must be reduced mod this.
    uint256 internal constant SCALAR_MODULUS =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /// @dev Precompile addresses.
    uint256 private constant EC_ADD = 0x06;
    uint256 private constant EC_MUL = 0x07;
    uint256 private constant EC_PAIRING = 0x08;

    /// @dev Bytes per (G1, G2) pairing operand: 64 + 128.
    uint256 private constant PAIR_SIZE = 0xC0;

    /// @dev Four pairs are staged: (-A,B), (alpha,beta), (vk_x,gamma), (C,delta).
    uint256 private constant PAIRING_INPUT_SIZE = 0x300;

    error InvalidVerifyingKeyLength();
    error PublicInputOutOfField();
    error PrecompileFailed();

    /// @notice Verify a Groth16 proof.
    /// @param proof  Flattened proof: `[A.x, A.y, B.x_c1, B.x_c0, B.y_c1, B.y_c0, C.x, C.y]`.
    /// @param vk     Flattened verifying key: `alpha(2) || beta(4) || gamma(4) || delta(4)`.
    /// @param ic     Flattened IC points, `2 * (input.length + 1)` words long.
    /// @param input  Public inputs, each strictly less than the scalar field order.
    /// @return ok    True when the proof satisfies the verification equation.
    function verifyProof(
        uint256[8] memory proof,
        uint256[14] memory vk,
        uint256[] memory ic,
        uint256[] memory input
    ) internal view returns (bool ok) {
        // IC must hold exactly one point per public input, plus the constant term.
        if (ic.length != (input.length + 1) * 2) {
            revert InvalidVerifyingKeyLength();
        }

        // Reject inputs outside the scalar field. An unreduced scalar would be
        // silently reduced by the ecMul precompile, letting two distinct input
        // vectors verify against the same proof.
        uint256 scalarModulus = SCALAR_MODULUS;
        for (uint256 i = 0; i < input.length; ) {
            if (input[i] >= scalarModulus) revert PublicInputOutOfField();
            unchecked {
                ++i;
            }
        }

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


        // vk_x = IC[0] + sum(input[i] * IC[i+1])
        (uint256 vkX, uint256 vkY) = _accumulatePublicInputs(ic, input);

        assembly ("memory-safe") {
            // Claim one contiguous buffer for the whole pairing call. Nothing
            // below allocates again, so the free memory pointer moves once.
            let buf := mload(0x40)
            mstore(0x40, add(buf, PAIRING_INPUT_SIZE))

            // ---- pair 0: (-A, B) -------------------------------------------
            // Negating A on the G1 side is cheaper than negating the Fp2
            // coordinates of B, and (x, 0) is its own negation.
            let ax := mload(proof)
            let ay := mload(add(proof, 0x20))
            mstore(buf, ax)
            switch ay
            case 0 {
                mstore(add(buf, 0x20), 0)
            }
            default {
                mstore(add(buf, 0x20), sub(FIELD_MODULUS, ay))
            }
            mstore(add(buf, 0x40), mload(add(proof, 0x40)))
            mstore(add(buf, 0x60), mload(add(proof, 0x60)))
            mstore(add(buf, 0x80), mload(add(proof, 0x80)))
            mstore(add(buf, 0xA0), mload(add(proof, 0xA0)))

            // ---- pair 1: (alpha, beta) -------------------------------------
            let p1 := add(buf, PAIR_SIZE)
            mstore(p1, mload(vk))
            mstore(add(p1, 0x20), mload(add(vk, 0x20)))
            mstore(add(p1, 0x40), mload(add(vk, 0x40)))
            mstore(add(p1, 0x60), mload(add(vk, 0x60)))
            mstore(add(p1, 0x80), mload(add(vk, 0x80)))
            mstore(add(p1, 0xA0), mload(add(vk, 0xA0)))

            // ---- pair 2: (vk_x, gamma) -------------------------------------
            let p2 := add(p1, PAIR_SIZE)
            mstore(p2, vkX)
            mstore(add(p2, 0x20), vkY)
            mstore(add(p2, 0x40), mload(add(vk, 0xC0)))
            mstore(add(p2, 0x60), mload(add(vk, 0xE0)))
            mstore(add(p2, 0x80), mload(add(vk, 0x100)))
            mstore(add(p2, 0xA0), mload(add(vk, 0x120)))

            // ---- pair 3: (C, delta) ----------------------------------------
            let p3 := add(p2, PAIR_SIZE)
            mstore(p3, mload(add(proof, 0xC0)))
            mstore(add(p3, 0x20), mload(add(proof, 0xE0)))
            mstore(add(p3, 0x40), mload(add(vk, 0x140)))
            mstore(add(p3, 0x60), mload(add(vk, 0x160)))
            mstore(add(p3, 0x80), mload(add(vk, 0x180)))
            mstore(add(p3, 0xA0), mload(add(vk, 0x1A0)))

            // Reuse scratch space for the single-word result.
            let success := staticcall(
                gas(),
                EC_PAIRING,
                buf,
                PAIRING_INPUT_SIZE,
                0x00,
                0x20
            )
            if iszero(success) {
                // Malformed points make the precompile fail rather than return
                // zero; surface that as an explicit revert.
                mstore(0x00, 0x84e81692) // PrecompileFailed()
                revert(0x1c, 0x04)
            }
            ok := eq(mload(0x00), 1)
        }
    }

    /// @dev Accumulate `IC[0] + sum(input[i] * IC[i+1])` using the ecMul and
    ///      ecAdd precompiles. Each iteration reuses one 128-byte scratch
    ///      buffer instead of allocating per operation.
    function _accumulatePublicInputs(
        uint256[] memory ic,
        uint256[] memory input
    ) private view returns (uint256 x, uint256 y) {
        assembly ("memory-safe") {
            let icData := add(ic, 0x20)
            let inputData := add(input, 0x20)
            let n := mload(input)

            // Scratch: 0x00..0x80 holds ecAdd operands, 0x80..0xE0 holds ecMul.
            let scratch := mload(0x40)
            mstore(0x40, add(scratch, 0xE0))

            // Start the accumulator at IC[0].
            x := mload(icData)
            y := mload(add(icData, 0x20))

            for {
                let i := 0
            } lt(i, n) {
                i := add(i, 1)
            } {
                // ecMul(IC[i+1], input[i]) -> scratch[0x80..0xC0]
                let icOffset := add(icData, mul(add(i, 1), 0x40))
                mstore(add(scratch, 0x80), mload(icOffset))
                mstore(add(scratch, 0xA0), mload(add(icOffset, 0x20)))
                mstore(add(scratch, 0xC0), mload(add(inputData, mul(i, 0x20))))

                if iszero(
                    staticcall(
                        gas(),
                        EC_MUL,
                        add(scratch, 0x80),
                        0x60,
                        add(scratch, 0x40),
                        0x40
                    )
                ) {
                    mstore(0x00, 0x84e81692) // PrecompileFailed()
                    revert(0x1c, 0x04)
                }

                // ecAdd(accumulator, product) -> accumulator
                mstore(scratch, x)
                mstore(add(scratch, 0x20), y)

                if iszero(
                    staticcall(gas(), EC_ADD, scratch, 0x80, scratch, 0x40)
                ) {
                    mstore(0x00, 0x84e81692) // PrecompileFailed()
                    revert(0x1c, 0x04)
                }

                x := mload(scratch)
                y := mload(add(scratch, 0x20))
            }
        }
    }
}

/// @dev Wrapper contract to expose the library for testing and gas measurement.
contract YulGroth16VerifierWrapper {
    function verify(
        uint256[8] memory proof,
        uint256[14] memory vk,
        uint256[] memory ic,
        uint256[] memory input
    ) external view returns (bool) {
        return YulGroth16Verifier.verifyProof(proof, vk, ic, input);
    }
}
