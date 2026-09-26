// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library YulGroth16Verifier {
    uint256 internal constant FIELD_MODULUS = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    uint256 internal constant SCALAR_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 private constant EC_ADD = 0x06;
    uint256 private constant EC_MUL = 0x07;
    uint256 private constant EC_PAIRING = 0x08;
    uint256 private constant PAIR_SIZE = 0xC0;
    uint256 private constant PAIRING_INPUT_SIZE = 0x300;

    error InvalidVerifyingKeyLength();
    error PublicInputOutOfField();
    error PrecompileFailed();

    function verifyProof(uint256[8] memory proof, uint256[14] memory vk, uint256[] memory ic, uint256[] memory input) internal view returns (bool ok) {
        if (ic.length != (input.length + 1) * 2) revert InvalidVerifyingKeyLength();
        uint256 scalarModulus = SCALAR_MODULUS;
        for (uint256 i = 0; i < input.length; ) {
            if (input[i] >= scalarModulus) revert PublicInputOutOfField();
            unchecked { ++i; }
        }
        (uint256 vkX, uint256 vkY) = _accumulatePublicInputs(ic, input);
        assembly ("memory-safe") {
            let buf := mload(0x40)
            mstore(0x40, add(buf, PAIRING_INPUT_SIZE))
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
            let p1 := add(buf, PAIR_SIZE)
            mstore(p1, mload(vk))
            mstore(add(p1, 0x20), mload(add(vk, 0x20)))
            mstore(add(p1, 0x40), mload(add(vk, 0x40)))
            mstore(add(p1, 0x60), mload(add(vk, 0x60)))
            mstore(add(p1, 0x80), mload(add(vk, 0x80)))
            mstore(add(p1, 0xA0), mload(add(vk, 0xA0)))
            let p2 := add(p1, PAIR_SIZE)
            mstore(p2, vkX)
            mstore(add(p2, 0x20), vkY)
            mstore(add(p2, 0x40), mload(add(vk, 0xC0)))
            mstore(add(p2, 0x60), mload(add(vk, 0xE0)))
            mstore(add(p2, 0x80), mload(add(vk, 0x100)))
            mstore(add(p2, 0xA0), mload(add(vk, 0x120)))
            let p3 := add(p2, PAIR_SIZE)
            mstore(p3, mload(add(proof, 0xC0)))
            mstore(add(p3, 0x20), mload(add(proof, 0xE0)))
            mstore(add(p3, 0x40), mload(add(vk, 0x140)))
            mstore(add(p3, 0x60), mload(add(vk, 0x160)))
            mstore(add(p3, 0x80), mload(add(vk, 0x180)))
            mstore(add(p3, 0xA0), mload(add(vk, 0x1A0)))
            let success := staticcall(gas(), EC_PAIRING, buf, PAIRING_INPUT_SIZE, 0x00, 0x20)
            if iszero(success) {
                mstore(0x00, 0x84e81692)
                revert(0x1c, 0x04)
            }
            ok := eq(mload(0x00), 1)
        }
    }

    function _accumulatePublicInputs(uint256[] memory ic, uint256[] memory input) private view returns (uint256 x, uint256 y) {
        assembly ("memory-safe") {
            let icData := add(ic, 0x20)
            let inputData := add(input, 0x20)
            let n := mload(input)
            let scratch := mload(0x40)
            mstore(0x40, add(scratch, 0xE0))
            x := mload(icData)
            y := mload(add(icData, 0x20))
            for { let i := 0 } lt(i, n) { i := add(i, 1) } {
                let icOffset := add(icData, mul(add(i, 1), 0x40))
                mstore(add(scratch, 0x80), mload(icOffset))
                mstore(add(scratch, 0xA0), mload(add(icOffset, 0x20)))
                mstore(add(scratch, 0xC0), mload(add(inputData, mul(i, 0x20))))
                if iszero(staticcall(gas(), EC_MUL, add(scratch, 0x80), 0x60, add(scratch, 0x40), 0x40)) {
                    mstore(0x00, 0x84e81692)
                    revert(0x1c, 0x04)
                }
                mstore(scratch, x)
                mstore(add(scratch, 0x20), y)
                if iszero(staticcall(gas(), EC_ADD, scratch, 0x80, scratch, 0x40)) {
                    mstore(0x00, 0x84e81692)
                    revert(0x1c, 0x04)
                }
                x := mload(scratch)
                y := mload(add(scratch, 0x20))
            }
        }
    }

    function verifyThreshold(bytes calldata packedSignatures, uint256 validatorBitmask, address[] calldata validatorAddresses, uint256 threshold) internal view returns (bool) {
        uint256 sigCount = packedSignatures.length / 65;
        uint256 validCount = 0;
        uint256 mask = validatorBitmask;
        for (uint256 i = 0; i < sigCount; ) {
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                let sigOffset := add(packedSignatures.offset, mul(i, 65))
                r := calldataload(sigOffset)
                s := calldataload(add(sigOffset, 32))
                v := byte(0, calldataload(add(sigOffset, 64)))
            }
            bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encodePacked(i))));
            address signer;
            assembly {
                mstore(0x00, ethSignedMessageHash)
                mstore(0x20, v)
                mstore(0x40, r)
                mstore(0x60, s)
                let success := staticcall(gas(), 0x01, 0x00, 0x80, 0x80, 0x20)
                signer := mload(0x80)
            }
            for (uint256 j = 0; j < validatorAddresses.length; ) {
                if (validatorAddresses[j] == signer && (mask & (uint256(1) << j)) != 0) {
                    validCount++;
                    mask &= ~(uint256(1) << j);
                    break;
                }
                unchecked { ++j; }
            }
            unchecked { ++i; }
        }
        return validCount >= threshold;
    }

    function countSetBits(uint256 bitmask) internal pure returns (uint256 count) {
        assembly {
            let x := bitmask
            for { } gt(x, 0) {} {
                x := and(x, sub(x, 1))
                count := add(count, 1)
            }
        }
    }

    function isBitSet(uint256 bitmask, uint256 index) internal pure returns (bool) {
        return (bitmask & (uint256(1) << index)) != 0;
    }
}

contract YulGroth16VerifierWrapper {
    function verify(uint256[8] memory proof, uint256[14] memory vk, uint256[] memory ic, uint256[] memory input) external view returns (bool) {
        return YulGroth16Verifier.verifyProof(proof, vk, ic, input);
    }
}
