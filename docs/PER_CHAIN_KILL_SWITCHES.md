# Per-chain withdrawal and exposure kill switches

## Objective
Provide per-chain controls to halt withdrawals and cap/stop new exposure when a chain, bridge lane, oracle, or RPC set is unhealthy. Controls must be explicit, auditable, and fail-safe.

## Controls
- **withdrawals_paused[chainId]**: blocks outbound withdrawals/settlements on affected chain.
- **deposits_paused[chainId]**: blocks new deposits/exposure on affected chain.
- **exposure_cap[chainId]**: max outstanding exposure; new deposits rejected above cap.
- **global_pause**: emergency all-chain stop; per-chain switches remain visible.

## Authorization
- Pause/kill-switch actions require authorized governance/operator role (multisig/timelock in production).
- Unpause requires independent approval and post-incident verification.
- All actions emit events with actor, chainId, reason code, and timestamp.

## Invariants
- Unauthorized callers cannot mutate pause/cap state.
- Paused chain cannot increase protected outflow.
- Existing accounting totals remain consistent across pause/unpause.
- Pause state is read from trusted config/state, not untrusted RPC.

## Operations
- Runbook: detect anomaly -> pause affected chain -> assess exposure -> communicate -> remediate -> canary -> unpause with approval.
- Monitoring: alert on pause state changes, cap breaches, failed pause attempts, and repeated withdrawals on paused chain.

## Verification
- Unit tests for auth, boundary caps, pause/unpause transitions.
- Invariant/fuzz tests for pause + concurrent withdrawal/deposit attempts.
- Fork tests per supported chain for deployment config and event emission.
