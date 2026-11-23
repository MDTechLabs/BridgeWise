# Fork tests against each supported chain deployment

## Objective
Run fork/integration tests against every supported chain deployment to verify deployed bytecode, config, and runtime behavior match release expectations.

## Supported chain matrix
Maintain a versioned matrix in config (not inferred from RPC):

| Chain | Chain ID | Deployment addresses | RPC env | Fork block policy | Owner |
|---|---:|---|---|---|---|
| Ethereum | 1 | from deployment manifest | `ETH_RPC_URL` | pinned block | TBD |
| Arbitrum | 42161 | from deployment manifest | `ARB_RPC_URL` | pinned block | TBD |
| Base | 8453 | from deployment manifest | `BASE_RPC_URL` | pinned block | TBD |
| Stellar/Soroban | n/a | contract IDs from manifest | `SOROBAN_RPC_URL` | pinned ledger | TBD |

## Required checks
- Deployed runtime bytecode hash matches reproducible build artifact.
- Constructor/init config matches expected chain-specific parameters.
- Core flows: deposit, message execution, refund/retry, pause.
- Unauthorized caller/replayed message rejected.
- Accounting invariants hold across success/revert/recovery.
- Gas/resource bounds recorded for worst-case path.

## Fork test procedure
1. Load pinned block/ledger and deployment manifest.
2. Verify bytecode/config provenance before behavioral tests.
3. Run smoke and adversarial cases per chain.
4. Capture tx traces/logs and invariant outputs as CI artifacts.
5. Fail release on any mismatch/drift.

## Safety
- No production private keys. Use fork test accounts or isolated signers.
- Do not broadcast to mainnet from CI.
- Treat RPC data as untrusted; cross-check critical reads.

## Evidence
- Per-chain CI job logs.
- Bytecode/config verification report.
- Invariant/fuzz summaries and gas/resource bounds.
