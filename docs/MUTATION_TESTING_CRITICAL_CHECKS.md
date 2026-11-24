# Mutation testing for critical authorization and accounting checks

## Objective
Use mutation testing to verify tests catch regressions in critical authorization and accounting logic.

## Scope
- Authorization: role checks, pause/kill-switch guards, multisig/admin-only paths.
- Accounting: deposit/withdraw/settle/refund invariants, supply/escrow totals, replay/double-spend guards.

## Tooling
- Solidity/contracts: Foundry mutation/invariant tooling or vetted mutation framework in CI (non-production).
- TS/services: Stryker (or equivalent) scoped to critical modules.

## Policy
- Critical modules must meet agreed mutation score threshold before release.
- Surviving mutants in critical paths require triage: add test or document justified exception.

## CI integration
- Run mutation tests on release candidates/nightly for critical paths.
- Store report artifact and link in release checklist.

## Safety
- No production keys/secrets. Run in isolated test environment.
