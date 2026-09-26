// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MerkleProofYul
/// @notice Gas-optimized sparse Merkle proof verification using inline
///         assembly. Targets at least 25% gas savings vs. the standard
///         OpenZeppelin MerkleProof library by hashing directly in
///         scratch space (0x00–0x40) and avoiding memory allocations.
library MerkleProofYul {
    /// @notice Verify a Merkle inclusion proof entirely in Yul/Assembly.
    /// @param proof Array of sibling hashes from leaf to root.
    /// @param root   Expected Merkle root.
    /// @param leaf   The leaf hash to verify.
    /// @return True if the proof is valid.
    function verifyProof(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        // Assembly-optimized verification
        assembly {
            let computedHash := leaf
            let proofLength := mload(proof)
            let proofStart := add(proof, 0x20)

            for { let i := 0 } lt(i, proofLength) { i := add(i, 1) } {
                let sibling := mload(add(proofStart, mul(i, 0x20)))

                // Sort: put smaller hash first for canonical ordering
                // Use scratch space at 0x00 and 0x20 for the pair
                switch lt(computedHash, sibling)
                case 1 {
                    // computedHash < sibling → write computedHash first
                    mstore(0x00, computedHash)
                    mstore(0x20, sibling)
                }
                default {
                    // sibling <= computedHash → write sibling first
                    mstore(0x00, sibling)
                    mstore(0x20, computedHash)
                }

                // Hash the pair in scratch space
                computedHash := keccak256(0x00, 0x40)
            }

            // Compare computed hash against root
            switch eq(computedHash, root)
            case 1 { storeTrue() }
            default { storeFalse() }

            function storeTrue() {
                mstore(0x00, 1)
                return(0x00, 0x20)
            }

            function storeFalse() {
                mstore(0x00, 0)
                return(0x00, 0x20)
            }
        }
    }
}

/// @dev Wrapper contract to expose the library for testing.
contract MerkleProofYulWrapper {
    function verify(
        bytes32[] calldata proof,
        bytes32 root,
        bytes32 leaf
    ) external pure returns (bool) {
        return MerkleProofYul.verifyProof(proof, root, leaf);
    }
}
