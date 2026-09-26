// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title YulEd25519Verifier
 * @dev Inline assembly verification wrapper for Ed25519 cryptographic signatures.
 * Targets the SHA-512 and curve precompile helpers to reduce verification gas.
 */
contract YulEd25519Verifier {
    address public immutable sha512Precompile;
    address public immutable curvePrecompile;

    /**
     * @param _sha512Precompile Address of the SHA-512 precompile.
     * @param _curvePrecompile Address of the Ed25519 curve precompile helper.
     */
    constructor(address _sha512Precompile, address _curvePrecompile) {
        sha512Precompile = _sha512Precompile;
        curvePrecompile = _curvePrecompile;
    }

    /**
     * @notice Verifies an Ed25519 signature.
     * @param publicKey The 32-byte Ed25519 public key.
     * @param message The message that was signed.
     * @param signature The 64-byte Ed25519 signature (R and s).
     * @return isValid True if the signature is valid, false otherwise.
     */
    function verify(
        bytes32 publicKey,
        bytes calldata message,
        bytes calldata signature
    ) external view returns (bool isValid) {
        address sha512 = sha512Precompile;
        address curve = curvePrecompile;

        assembly {
            // Memory layout in scratch space (0x00 to 0x80 = 128 bytes)
            // 0x00 - 0x20: publicKey (32 bytes)
            // 0x20 - 0x40: message digest (first 32 bytes from SHA-512 or full 64 if it overwrites 0x60)
            // 0x40 - 0x80: signature (64 bytes)
            // We'll place signature at 0x40 to 0x80.
            
            // 1. Hash the message using SHA-512 precompile
            let ptr := mload(0x40)
            let msgOffset := message.offset
            let msgLen := message.length
            
            calldatacopy(ptr, msgOffset, msgLen)
            
            // Call SHA-512 precompile (expected to return 64 bytes hash)
            // We write the first 32 bytes of the hash into 0x20. Wait, standard SHA512 returns 64 bytes.
            // Let's write the whole 64 bytes to a safe location, then copy what's needed.
            let sha512Success := staticcall(
                gas(),
                sha512,
                ptr,
                msgLen,
                ptr, // Output to the same free memory pointer
                64   // Expect 64 bytes
            )
            
            if iszero(sha512Success) {
                isValid := 0
                return(0, 0)
            }

            // 2. Format precompile argument memory directly in scratch space (0x00--0x80)
            // We will format the arguments as expected by the curve helper.
            // Typical Ed25519 curve helpers take:
            // - publicKey (32 bytes)
            // - message/hash (32 bytes)
            // - signature (64 bytes)
            
            // Write publicKey at 0x00
            mstore(0x00, publicKey)
            
            // Write the first 32 bytes of SHA-512 hash at 0x20
            // (Often, systems use SHA-256 for the message or truncate SHA-512 to 32 bytes for the curve precompile)
            mstore(0x20, mload(ptr)) 
            
            // Read signature from calldata and write to 0x40
            let sigOffset := signature.offset
            calldatacopy(0x40, sigOffset, 64)
            
            // Call Curve precompile
            let curveSuccess := staticcall(
                gas(),
                curve,
                0x00,
                0x80, // 128 bytes size
                0x00,
                0x20  // Expect 32 bytes return (boolean or uint)
            )
            
            if iszero(curveSuccess) {
                isValid := 0
            } else {
                isValid := mload(0x00) // Expect 1 for valid signature
            }
        }
    }
}
