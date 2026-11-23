# Global Escrow Solvency Invariants

The broader state machine, fee accounting, replay, reorg and recovery properties are specified in [BRIDGE_ESCROW_CONSERVATION_SPEC.md](./BRIDGE_ESCROW_CONSERVATION_SPEC.md). This document records the narrower per-chain solvency checks and the known `FallbackEscrow` gaps.

Scope: `contracts/execution/FallbackEscrow.sol`, deployed once per chain.

## Definitions

- `held(c, t)`: ERC-20 balance of token `t` held by the escrow on chain `c`.
- `outstanding(c, t)`: sum of `escrows[id].amount` over entries on chain `c` with token `t` and `claimed == false`.

## Invariants

- **S-1 (per-chain)**: `held(c, t) >= outstanding(c, t)` after every state-changing call.
- **S-2 (global)**: `sum_c held(c, t) >= sum_c outstanding(c, t)`. A shortfall on one chain is never covered by another, so S-1 is the operative guarantee; S-2 is the monitoring check across chains.
- **S-3 (no replay)**: a `messageId` can be escrowed once and claimed once. Replays revert (`AlreadyEscrowed`, `NothingToClaim`) and change no state.
- **S-4 (authorization)**: only the owner (the message receiver) can create entries.

## Trust assumptions

- Tokens are standard ERC-20 (no fee-on-transfer or rebasing); a fee-on-transfer token would break S-1.
- Chain parameters (escrow addresses per chain) are configured explicitly, not taken from RPC or relayer data.
- The owner is trusted to escrow only amounts that were actually bridged.

## Known gap

`claimEscrowedTokens` currently pays `msg.sender` and does not check the recipient, and `claimable` is not decremented on claim. Solvency does not depend on either, but both should be fixed separately.

## Enforcement

`test/execution/EscrowSolvency.test.ts` contains `assertGlobalSolvency`, run after each step of a two-chain escrow/claim/replay sequence. Operators should run the same comparison against live balances and alert on any shortfall; on alert, pause the receiver and stop escrowing until the gap is explained.
