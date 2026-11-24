# Per-asset exposure caps across destination chains

## Objective
Limit total and per-destination-chain exposure for each asset to reduce blast radius of chain, bridge, or liquidity failures.

## Cap model
- `global_cap[asset]` - max outstanding exposure across all chains.
- `chain_cap[asset][chainId]` - max exposure on a destination chain.
- `inflight_cap[asset][chainId]` - max pending/in-flight amount.
- Caps are versioned and governance-controlled.

## Enforcement
- Check caps before accepting deposit/mint/route allocation.
- Reject or reroute when cap exceeded; fail closed on missing cap config.
- Update exposure atomically with settlement/refund state transitions.

## Invariants
- Exposure never exceeds configured caps.
- Cap checks cannot be bypassed by replayed/unauthorized calls.
- Refund/recovery correctly decrements exposure.

## Verification
- Unit/fuzz tests for boundary caps, concurrency, replay, and refund paths.
- Fork/integration tests per supported chain and token decimals.
