// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library YulEd25519Verifier {
    function verify(bytes calldata signature, bytes32 messageHash, bytes calldata publicKey) internal view returns (bool) {
        bool isValid = true;
        assembly {
            let signatureLen := signature.length
            if iszero(eq(signatureLen, 64)) {
                isValid := false
            }
            if isValid {
                calldatacopy(0x00, publicKey.offset, publicKey.length)
                mstore(0x20, messageHash)
                let sha512Success := staticcall(gas(), 0x02, 0x00, 0x40, 0x00, 0x40)
                if iszero(sha512Success) {
                    isValid := false
                }
                if isValid {
                    let hashedPtr := mload(0x00)
                    calldatacopy(0x80, publicKey.offset, publicKey.length)
                    mstore(0xA0, mload(hashedPtr))
                    calldatacopy(0xC0, signature.offset, 64)
                    let curveSuccess := staticcall(gas(), 0x01, 0x80, 0x80, 0x00, 0x20)
                    if iszero(curveSuccess) {
                        isValid := 0
                    }
                    if curveSuccess {
                        isValid := mload(0x00)
                    }
                }
            }
        }
        return isValid;
    }
}

contract YulEd25519VerifierWrapper {
    function verify(bytes calldata signature, bytes32 messageHash, bytes calldata publicKey) external view returns (bool) {
        return YulEd25519Verifier.verify(signature, messageHash, publicKey);
    }
}
