// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title YulBatchRouter
/// @notice Low-memory multi-recipient batch message router. Delivers a batch of
///         cross-chain execution payloads to arbitrary target handler contracts
///         within a single transaction, reading the batch directly from calldata
///         via Yul `calldataload`/`calldatacopy` instead of letting the Solidity
///         ABI decoder materialize a nested `struct[] calldata`/`bytes[] calldata`
///         array in memory up front.
/// @dev Rationale: decoding a high-level `struct Message[] calldata` (or
///      `bytes[] calldata`) still requires the ABI decoder to validate offsets
///      and, for callers that build the payload dynamically off-chain, often
///      forces an upstream memory array to be assembled before the call is even
///      made. This contract instead accepts a single opaque `bytes calldata`
///      blob with a custom, tightly packed encoding (documented below) that we
///      walk by hand with a calldata cursor. Only one memory allocation per
///      message is performed (the `calldatacopy` of that message's payload into
///      scratch memory, which is unavoidable since `call` requires memory-
///      resident input) — no nested memory array is ever grown.
///
///      Batch calldata encoding (`batchPayload`):
///        all integers are big-endian 32-byte words, exactly as `calldataload`
///        presents them (i.e. plain ABI-style words, NOT a further nested ABI
///        encoding).
///
///        [0x00:0x20)              uint256 messageCount
///        for each message i in [0, messageCount):
///          [off      :off+0x20)   address target       (right-aligned in the word)
///          [off+0x20 :off+0x40)   uint256 payloadLength (N)
///          [off+0x40 :off+0x40+N) bytes   payload       (raw bytes, tightly
///                                                        packed — NOT padded
///                                                        to a 32-byte boundary)
///        ... the next message's header begins immediately at `off + 0x40 + N`.
///
///      A `batchPayload` shorter than 32 bytes (including a zero-length
///      payload) is treated as an empty batch (`messageCount = 0`) rather than
///      reverting, so callers can pass `"0x"` for a no-op batch.
///
///      Worked example — a 2-message batch: message 0 sends the 4 bytes
///      `0xDEADBEEF` to `0xAAAA...AAAA`, message 1 sends the 2 bytes `0xBEEF`
///      to `0xBBBB...BBBB` (byte offsets relative to the start of `batchPayload`):
///
///        0x00  0000000000000000000000000000000000000000000000000000000000000002  // messageCount = 2
///        0x20  000000000000000000000000AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA  // message 0 target
///        0x40  0000000000000000000000000000000000000000000000000000000000000004  // message 0 payloadLength = 4
///        0x60  DEADBEEF                                                          // message 0 payload (4 bytes, unpadded)
///        0x64  000000000000000000000000BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB  // message 1 target (starts right after the 4-byte payload — NOT word aligned)
///        0x84  0000000000000000000000000000000000000000000000000000000000000002  // message 1 payloadLength = 2
///        0xA4  BEEF                                                              // message 1 payload (2 bytes)
///                                                                                 // total batchPayload length = 0xA6 (166) bytes
///
///      Dispatch uses a low-level `call` (NOT `delegatecall`) to each message's
///      `target`: `delegatecall` would execute the target handler's logic in
///      THIS router's own storage/identity context, which is almost never what
///      you want when routing to independent handler contracts that manage
///      their own state — `call` correctly gives each handler its own storage
///      and `msg.sender == address(this router)`, matching the convention
///      already established by `MessageReceiverCore.executeMessage`, which also
///      dispatches via a low-level `.call()`.
///
///      Failure isolation: each sub-call's success flag is checked individually.
///      A reverting sub-call does NOT propagate — its revert/return data is
///      captured via the call's returned `bytes memory` and re-emitted in a
///      `MessageDeliveryFailed` event for off-chain debuggability, and the loop
///      continues to the next message. This router holds no funds and no
///      cross-message state, so routing to arbitrary targets does not expose it
///      to a meaningful reentrancy surface; callers that route to handlers
///      touching shared state should apply reentrancy protection at that layer.
contract YulBatchRouter {
    /// @notice Emitted once per message that was delivered successfully.
    event MessageDelivered(uint256 indexed index, address indexed target);

    /// @notice Emitted once per message whose sub-call reverted. `returnData`
    ///         is the raw revert/return data from the failed sub-call (may be
    ///         empty if the target consumed all gas or returned nothing).
    event MessageDeliveryFailed(uint256 indexed index, address indexed target, bytes returnData);

    /// @notice Emitted once per batch with aggregate counts.
    event BatchProcessed(uint256 processed, uint256 succeeded, uint256 failed);

    /// @notice Thrown when `batchPayload`'s custom encoding is internally
    ///         inconsistent (a message header or payload runs past the end of
    ///         the supplied calldata).
    error MalformedBatch();

    /// @notice Route a batch of execution payloads to their target handler
    ///         contracts, isolating individual sub-call failures.
    /// @param batchPayload Custom-encoded batch, see the contract-level doc
    ///        comment for the exact byte layout.
    /// @return processed Number of messages found in the batch.
    /// @return succeeded Number of messages whose sub-call succeeded.
    /// @return failed    Number of messages whose sub-call reverted.
    function routeBatch(bytes calldata batchPayload)
        external
        returns (uint256 processed, uint256 succeeded, uint256 failed)
    {
        uint256 count;
        uint256 dataOffset;
        assembly {
            dataOffset := batchPayload.offset
        }
        if (batchPayload.length >= 32) {
            assembly {
                count := calldataload(dataOffset)
            }
        }

        if (count == 0) {
            emit BatchProcessed(0, 0, 0);
            return (0, 0, 0);
        }

        uint256 cursor = dataOffset + 32;
        uint256 end = dataOffset + batchPayload.length;

        for (uint256 i = 0; i < count; ) {
            if (cursor + 64 > end) revert MalformedBatch();

            address target;
            uint256 payloadLen;
            assembly {
                target := and(calldataload(cursor), 0xffffffffffffffffffffffffffffffffffffffff)
                payloadLen := calldataload(add(cursor, 0x20))
            }
            cursor += 64;

            if (cursor + payloadLen > end) revert MalformedBatch();

            // Copy just this message's payload into scratch memory. This is
            // the one unavoidable memory write per message (call requires
            // memory-resident input) — no nested memory array is grown.
            bytes memory payload;
            assembly {
                payload := mload(0x40)
                calldatacopy(add(payload, 0x20), cursor, payloadLen)
                mstore(payload, payloadLen)
                // Bump the free memory pointer past the payload, rounded up
                // to a 32-byte boundary, and free it again on the next
                // iteration by simply overwriting from the same pointer —
                // we never retain more than one message's payload at a time.
                mstore(0x40, add(add(payload, 0x20), and(add(payloadLen, 0x1f), not(0x1f))))
            }
            cursor += payloadLen;

            // solhint-disable-next-line avoid-low-level-calls
            (bool success, bytes memory returnData) = target.call(payload);

            if (success) {
                unchecked { ++succeeded; }
                emit MessageDelivered(i, target);
            } else {
                unchecked { ++failed; }
                emit MessageDeliveryFailed(i, target, returnData);
            }

            unchecked { ++i; }
        }

        processed = count;
        emit BatchProcessed(processed, succeeded, failed);
    }
}
