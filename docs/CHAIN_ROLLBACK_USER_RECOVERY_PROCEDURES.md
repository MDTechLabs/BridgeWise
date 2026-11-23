# Chain-specific rollback and user recovery procedures

## Objective
Document and test how BridgeWise handles chain reorgs, partial failures, and deployment incidents with safe rollback and user recovery paths.

## Chain-specific considerations
- **EVM L1/L2**: confirmation depth/finality tag differs; reorg handling and receipt revalidation required.
- **Soroban/Stellar**: ledger finality and recovery semantics differ; use chain-native tx status and idempotency keys.
- **Bridged assets**: preserve accounting invariant `deposited = held + delivered + refunded`.

## Rollback triggers
- Failed canary/invariant breach
- Provider disagreement/finality uncertainty
- Unauthorized state mutation attempt
- Deployment config mismatch

## Recovery procedure
1. Freeze affected lane (deposits/executions; refunds remain available where safe).
2. Snapshot chain state, transfer records, nonces, and config version.
3. Classify impact: no-mutation, partial, or settled.
4. Retry only provably unexecuted idempotent operations; refund/recover locked funds otherwise.
5. Verify accounting invariants and replay protection before unfreeze.
6. Publish incident record with evidence.

## User recovery
- Users get deterministic status: pending/locked/executed/refunded/manual-review.
- Support runbook includes tx hash, chain, nonce/message id, and last verified finalized block.
- No user is asked for private keys/secrets.

## Verification
- Tabletop/fork rehearsals per supported chain.
- Tests for reorg, delayed inclusion, duplicate replay, refund after failed execution, and post-rollback invariant checks.
