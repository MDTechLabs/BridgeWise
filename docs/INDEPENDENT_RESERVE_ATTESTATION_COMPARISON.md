# Independent reserve attestation and on-chain comparison

## Objective
Compare independent reserve attestations against on-chain balances/supply before sensitive actions. Disagreement must fail closed.

## Scope
- Bridge escrow/custody balances, wrapped supply, and liability records.
- Attestation sources: independent auditor/oracle feed, signed report, or proof endpoint.
- Chains/assets in scope defined by versioned config.

## Trust assumptions
- On-chain reads can be stale/reorged; use finalized/safe reads.
- Attestation provider can be stale/compromised; require freshness, signature, and source allowlist.
- Never infer reserve sufficiency from a single untrusted source.

## Comparison policy
1. Fetch on-chain balance/supply at finalized block/ledger.
2. Fetch latest valid attestation within freshness window.
3. Normalize units/decimals and asset mapping.
4. Compare: `attested_reserve >= onchain_liability` and delta within tolerance.
5. If stale/missing/mismatch/invalid signature: mark UNKNOWN and block dependent mint/release/route enablement.

## Invariants
- No mint/release when attestation is stale, missing, or below liability.
- Comparison uses versioned asset mapping and decimal normalization.
- Every decision is auditable (block, attestation id, delta, policy version).

## Alerting and recovery
- Alert on mismatch, stale attestation, source failure, or config drift.
- Operators pause affected route/asset and reconcile before resuming.

## Evidence
- Signed attestation artifact.
- On-chain read snapshot (block/ledger, address, value).
- Comparison report and decision log.
