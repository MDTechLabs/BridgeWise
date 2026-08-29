// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title B011Samples
/// @notice Fixture contract for rule B011 (Target Chain Address Format
///         Validation). Not intended to compile as a deployable contract —
///         function bodies are stubs. Used purely as an AST-parsing sample
///         for the `rules` static-analysis tool's test suite.
///
/// Cases covered:
///   1. bridgeTransfer      -> cross-chain transfer using `address recipient`
///                             alongside a chain-ID param => VIOLATION
///   2. bridgeTransferBytes32 -> equivalent function using `bytes32 recipient`
///                             => PASS
///   3. bridgeTransferBytes -> equivalent function using `bytes calldata
///                             recipient` => PASS
///   4. withdraw            -> merely has a parameter named "recipient" but
///                             is not a cross-chain transfer (no chain-ID
///                             param, ordinary-looking name) and uses
///                             `address recipient` => should NOT be flagged
contract B011Samples {
    // --- Case 1: VIOLATION ---
    // Cross-chain outbound transfer (name contains "bridge" + "transfer",
    // has a chain-ID-ish param) but restricts the recipient to a 20-byte
    // EVM `address`, which cannot represent non-EVM chain recipients
    // (e.g. Solana pubkeys, Bitcoin/Cosmos addresses).
    function bridgeTransfer(
        uint32 destinationChainId,
        address recipient,
        uint256 amount
    ) external {
        // stub
    }

    // --- Case 2: PASS ---
    // Same shape as Case 1, but the recipient is normalized to a `bytes32`,
    // matching this codebase's real convention (see
    // contracts/router/BatchBridgeRouter.sol / NativeBridgeRouter.sol).
    function bridgeTransferBytes32(
        uint32 destinationChainId,
        bytes32 recipient,
        uint256 amount
    ) external {
        // stub
    }

    // --- Case 3: PASS ---
    // Same shape as Case 1, but the recipient is a dynamic `bytes` value,
    // which can hold variable-length non-EVM address encodings.
    function bridgeTransferBytes(
        uint32 destinationChainId,
        bytes calldata recipient,
        uint256 amount
    ) external {
        // stub
    }

    // --- Case 4: should NOT be flagged ---
    // Has a parameter literally named "recipient" and uses a restricted
    // `address` type, but this is an ordinary domestic withdrawal with no
    // chain-ID parameter and a non-cross-chain-sounding name. The rule's
    // heuristic must not flag every "recipient"-named `address` parameter
    // everywhere — only ones plausibly bound for a non-EVM destination.
    function withdraw(address recipient, uint256 amount) external {
        // stub
    }
}
