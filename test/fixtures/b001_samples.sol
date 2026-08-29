// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title B001 Rule Fixtures - Chain ID Enforcement in Bridge Hashes
/// @notice This file is a static-analysis fixture only. It is NOT meant to
/// compile as a deployable contract (stub bodies, no real logic beyond the
/// hash expressions themselves) - valid Solidity *syntax* is all that
/// matters here, since it exists purely to exercise the B001 rule's
/// AST-walking logic against a mix of vulnerable and safe hash
/// constructions.
contract B001Samples {
    // Conventional EIP-712 domain type hash. This is a compile-time hash of
    // a fixed type *string*, not a per-message hash construction, so the
    // B001 rule intentionally does not scan contract-level state variable
    // initializers (see rules/src/b001_chain_id_check.rs for the scoping
    // rationale) - it would be a false positive to flag this line.
    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    // -----------------------------------------------------------------
    // Case 1: VIOLATION - cross-chain message hash omits any chain ID.
    // A signature over this hash could be intercepted and replayed on a
    // fork chain or on any other EVM chain sharing the same contract
    // address layout.
    // -----------------------------------------------------------------
    function computeBridgeMessageHash(
        address sender,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(sender, recipient, amount, nonce));
    }

    // -----------------------------------------------------------------
    // Case 2: SAFE - explicitly folds `block.chainid` into the hashed
    // payload, binding the resulting signature to the chain it was
    // created on.
    // -----------------------------------------------------------------
    function computeBridgeMessageHashSafe(
        address sender,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(sender, recipient, amount, nonce, block.chainid)
            );
    }

    // -----------------------------------------------------------------
    // Case 3: SAFE - EIP-712 style domain separator hashing. The domain
    // separator folds `block.chainid` into the typed-data hash, which is
    // the conventional way EIP-712 signatures resist cross-chain replay.
    // The nested `keccak256(bytes("BridgeWise"))` / `keccak256(bytes("1"))`
    // calls hash the static name/version fields (not per-message payloads)
    // and are intentionally not treated as independent violation sites -
    // see the "no nested descent past a matched keccak256 call" note in
    // rules/src/b001_chain_id_check.rs.
    // -----------------------------------------------------------------
    function domainSeparator() public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH,
                    keccak256(bytes("BridgeWise")),
                    keccak256(bytes("1")),
                    block.chainid,
                    address(this)
                )
            );
    }

    // -----------------------------------------------------------------
    // Case 4: SAFE - uses explicit named source/destination chain ID
    // parameters instead of `block.chainid`. This pattern is common in
    // bridge contracts that must hash a *different* chain's ID than the
    // one they are currently executing on (e.g. hashing the destination
    // chain ID while running on the source chain).
    // -----------------------------------------------------------------
    function computeCrossChainTransferHash(
        uint256 sourceChainId,
        uint256 destinationChainId,
        address sender,
        address recipient,
        uint256 amount
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    sourceChainId,
                    destinationChainId,
                    sender,
                    recipient,
                    amount
                )
            );
    }

    // -----------------------------------------------------------------
    // Case 5: VIOLATION - a signature verifier that hashes the message
    // without any chain binding before recovering the signer. This is the
    // canonical cross-chain replay bug the rule targets.
    // -----------------------------------------------------------------
    function verifyBridgeSignature(
        address signer,
        bytes32 messageBody,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public pure returns (bool) {
        bytes32 hash = keccak256(abi.encodePacked(messageBody));
        return ecrecover(hash, v, r, s) == signer;
    }
}
