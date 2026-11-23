# Multisig nonce coordination and replacement policy

## Objective
Define deterministic nonce coordination and transaction replacement for multisig/governance submissions to prevent stuck, duplicated, or conflicting operations.

## Policy
- **Nonce source of truth**: on-chain nonce/state at finalized block, corroborated by >=2 RPC providers.
- **Reservation**: before submission, reserve nonce in an internal coordination record with owner, intent, expiry, and chainId.
- **Conflict rule**: no two active intents may share nonce unless one is an explicit replacement.
- **Replacement**: only same signer authority/intent owner may replace; replacement must bump fee per chain rules, reference replaced tx hash, and keep same security-critical payload unless explicitly approved.
- **Expiry**: stale reservations expire; expired reservations cannot be submitted without recheck.

## Safety
- Never sign with production keys in tests/CI.
- Reject replacement that changes target/chain/value/permissions without new approval.
- Record every submission, replacement, cancellation, and final receipt.

## Recovery
- On stuck tx: query mempool/on-chain state from multiple providers; if not included, submit approved replacement; if included, reconcile and release reservation.

## Verification
- Tests for nonce conflict, duplicate reservation, unauthorized replacement, payload-mutation attempts, and expiry.
- Integration tests on fork/simulated mempool delay per chain.
