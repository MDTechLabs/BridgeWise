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
