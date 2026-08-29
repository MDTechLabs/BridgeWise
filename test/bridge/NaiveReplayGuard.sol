// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Test-only control contract for the gas-comparison benchmark in
///      NonceBitmap.test.ts. Mirrors the "naive" boolean-per-message pattern the
///      issue describes (`mapping(bytes32 => bool) public processedMessages`), just
///      keyed by `uint256` nonce instead of `bytes32` message hash so the comparison
///      is apples-to-apples against NonceBitmapWrapper (same nonce sequence, same
///      cold-storage-slot-per-write cost model). Each processed nonce here always
///      touches a brand-new storage slot, unlike the packed bitmap which reuses one
///      word per 256 nonces.
contract NaiveReplayGuard {
    error AlreadyProcessed(uint256 nonce);

    mapping(uint256 => bool) public processedMessages;

    function markProcessed(uint256 nonce) external {
        if (processedMessages[nonce]) revert AlreadyProcessed(nonce);
        processedMessages[nonce] = true;
    }

    /// @dev Mirrors NonceBitmapWrapper.markProcessedBatch so the gas comparison
    ///      isolates storage bookkeeping cost from fixed per-transaction overhead.
    function markProcessedBatch(uint256[] calldata nonces) external {
        for (uint256 i = 0; i < nonces.length; i++) {
            uint256 nonce = nonces[i];
            if (processedMessages[nonce]) revert AlreadyProcessed(nonce);
            processedMessages[nonce] = true;
        }
    }
}
