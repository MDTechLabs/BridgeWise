# Insolvency response and user-claim priority policy

## Objective
Define deterministic, auditable behavior when BridgeWise liabilities exceed available liquid assets or when a reserve shortfall is detected. Protect users with an explicit claim priority policy and fail-safe controls.

## Trigger conditions
- Reserve attestation < on-chain liabilities.
- Escrow balance shortfall for a supported asset/chain.
- Liquidity provider default/correlated failure causing unfillable obligations.
- Oracle/provider disagreement indicating possible insolvency state.

## Response phases
1. **Detect** - independent attestation/on-chain comparison flags deficit; emit critical alert.
2. **Contain** - pause affected deposits/routes/mints; allow only policy-approved recovery/refund actions.
3. **Assess** - snapshot liabilities, assets, pending claims, and chain finality state at finalized block.
4. **Prioritize claims** - apply published priority order.
5. **Distribute/recover** - pro-rata or priority-based settlement per policy; record evidence.
6. **Resume** - only after independent verification and governance sign-off.

## Claim priority policy (default)
| Priority | Claim class | Rationale |
|---:|---|---|
| 1 | Finalized user withdrawals/refunds already accepted | Prevent user fund loss |
| 2 | In-flight user bridge settlements with proven finality | Preserve bridge correctness |
| 3 | Protocol fee/treasury claims | Subordinated to users |
| 4 | Operator/incentive claims | Subordinated |

Policy must be versioned per deployment; changes require governance approval and audit trail.

## Invariants
- No silent mint/release when insolvent.
- No privileged claim jumps priority without explicit governance emergency action recorded.
- Accounting snapshot is immutable/auditable.
- Partial payouts cannot exceed available assets.

## Verification
- Unit/fuzz tests for priority ordering, partial payouts, replay, and unauthorized overrides.
- Fork tests per supported chain and asset.
- Tabletop insolvency drill evidence before release.
