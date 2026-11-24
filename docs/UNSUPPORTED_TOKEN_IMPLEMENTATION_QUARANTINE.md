# Detect and quarantine unsupported or upgraded token implementations

## Objective
Detect token contracts that deviate from supported behavior or have been upgraded unexpectedly, and quarantine them before they can affect bridge accounting or user funds.

## Detection signals
- Runtime bytecode/code hash changed from approved manifest.
- Proxy implementation slot changed unexpectedly.
- Token behavior probe fails: transfer return, fee-on-transfer, rebasing, allowance semantics, decimals, hooks.
- Asset metadata/decimals mismatch against registry.

## Quarantine policy
- Mark token/route `QUARANTINED` in versioned config/state.
- Block new deposits/mints/routes for quarantined token.
- Allow only governance-approved recovery/refund paths.
- Emit audit event with token, chain, old/new implementation, detector, timestamp.

## Controls
- Approved token implementation allowlist per chain/asset.
- Periodic and pre-transaction probe checks.
- Governance-only unquarantine after review and tests.

## Invariants
- Quarantined token cannot increase protected exposure.
- Unsupported implementation cannot be treated as supported by default.
- Detection decisions are auditable and reproducible.

## Verification
- Unit/fork tests for proxy upgrades, bytecode drift, and malicious token behavior.
- Integration tests for quarantine blocking deposits/routes.
