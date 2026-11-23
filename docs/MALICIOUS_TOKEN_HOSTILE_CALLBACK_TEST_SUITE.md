# Malicious token and hostile callback test suite

## Objective
Validate that BridgeWise safely handles adversarial ERC-20/token and callback behaviors before production release. Tests must fail closed: no protected state mutation, no accounting drift, and no unbounded work when a token/callback is hostile.

## Threat model
- **Reentrancy callbacks**: token hooks (ERC777 tokensReceived, ERC721/ERC1155 receiver hooks, malicious receiver contracts) attempt to re-enter deposit/withdraw/settle/refund.
- **Return-value lies**: token returns `false` instead of reverting, returns malformed data, or returns unexpected values.
- **Fee-on-transfer / rebasing / balance mutation**: delivered amount differs from requested amount.
- **Gas griefing**: callback consumes excessive gas or reverts with large returndata.
- **Approval/transferFrom quirks**: token requires zero-approval reset, reverts on non-zero allowance, or changes allowance semantics.
- **Callback target control**: arbitrary call target supplied by message/adapter path.

## Affected components / boundaries
- Token transfer adapters and bridge escrow accounting.
- Message execution paths that perform external calls.
- Refund/retry/recovery paths that re-touch token balances.
- Admin/emergency pause controls.

## Required test cases
| Case | Expected result |
|---|---|
| Reentrant deposit callback | Reentrancy guard blocks; state unchanged except expected revert |
| Reentrant withdraw/refund callback | Blocked; no double-withdraw/refund |
| `transfer` returns false | Revert/fail-closed; no accounting credit |
| `transferFrom` reverts | Revert/fail-closed; no accounting credit |
| Fee-on-transfer token | Either explicitly supported with measured delta or rejected; no silent accounting drift |
| Rebasing token | Rejected or isolated by policy; invariant checks alert |
| Malicious callback reverts | Parent operation fails safely; no partial protected mutation |
| Malicious callback returns huge returndata | Bounded handling; no OOG/resource exhaustion |
| ERC777 hook reentrancy | Blocked by guard/checks-effects-interactions |
| Unauthorized callback caller | Rejected |
| Replayed message with hostile token | Rejected by replay protection before/without unsafe side effects |

## Invariants
- `escrow_accounted == sum(locked) - sum(released) - sum(refunded)` for supported tokens.
- No protected state transition occurs on failed external token interaction.
- No duplicate settlement/refund for same message/nonce.
- Pause blocks new protected actions; already-settled state remains consistent.

## Implementation guidance
- Use mock malicious tokens/contracts in test fixtures only; never deploy to production.
- Isolate signing keys; use deterministic local test keys only.
- Measure worst-case gas/resource bounds for external calls.
- Add fuzz/stateful tests for multi-step sequences: deposit -> fail callback -> retry -> refund.

## Evidence
- Unit/fuzz/invariant test run logs.
- Gas/resource report for worst-case callback path.
- Threat-model review note when external-call boundary changes.
