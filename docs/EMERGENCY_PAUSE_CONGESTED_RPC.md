# Emergency pause under congested RPC and delayed transaction inclusion

## Objective
Ensure emergency pause remains effective and auditable when RPC providers are congested, delayed, or partially unavailable.

## Risks
- Pause tx delayed in mempool.
- RPC cannot confirm submission/inclusion.
- Operators receive stale state and falsely assume paused/unpaused.

## Controls
- Submit pause via authorized multisig/governance path with pre-approved calldata.
- Use multiple RPC providers and private/priority submission where available.
- Confirm pause state by on-chain read from >=2 independent providers after required confirmations.
- Keep withdrawals/deposits blocked in app/relayer layer as defense-in-depth once pause initiated.

## Procedure
1. Declare incident and initiate pause.
2. Submit pause tx; record nonce, gas policy, replacement policy.
3. If delayed, follow approved replacement policy (same payload, fee bump only).
4. Verify `paused=true` on-chain across providers; verify events.
5. Halt dependent automation until pause confirmed.
6. Communicate status internally/externally per incident process.

## Verification
- Tests simulate delayed inclusion, RPC timeout, provider disagreement, and replacement.
- Fork test confirms pause blocks protected actions and emits events.
- Runbook drill evidence attached to release.
