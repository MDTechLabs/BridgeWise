# Signer policy allowlists and privileged-operation simulation gate

Evidence and operating notes for issues #1513 and #1514.

## Scope and affected surfaces

| Surface | Location | Purpose |
| --- | --- | --- |
| Signer policy contract | `contracts/policy/SignerPolicy.sol` | Per-signer destination and method allowlists, simulation attestation, replay protection, accounting |
| Policy executor harness | `test/policy/MockPolicyExecutor.sol` | Applies the policy before any low-level target call and bubbles target failures |
| Token harness | `test/policy/MockPolicyToken.sol` | Minimal transferable token used to check balance invariants |
| Unit / boundary tests | `test/policy/SignerPolicy.test.ts` | Valid, invalid, boundary and adversarial inputs |
| Stateful fuzz tests | `test/policy/SignerPolicy.fuzz.test.ts` | 200 randomized transitions with a shadow model and invariant checks after every step |
| Chain/token integration | `test/policy/SignerPolicy.integration.test.ts` | Four chain profiles, token transfers, revert/retry, reorg and outage behaviour |
| TS simulation gate | `src/security/simulation/privileged-operation-simulation-gate.ts` | Fail-closed simulation enforcement for privileged operations |
| TS simulation gate tests | `src/security/simulation/privileged-operation-simulation-gate.spec.ts` | Denial reasons, retry, replay, freshness and work bounds |
| Scoped Hardhat config | `scripts/hardhat.signer-policy.config.ts` | Compiles only `contracts/policy` and `test/policy`, so evidence does not depend on unrelated upgradeable contract dependencies |

No production keys or RPC endpoints are used anywhere in this evidence. Random wallets are
created only inside existing Yul signature tests; this suite uses the in-process Hardhat
signers exclusively.

## Trust assumptions and authorization boundaries

- `admin` is the single governance authority. It sets signers, executors, chain parameters,
  allowlist entries, simulation attestations and revocations. It cannot execute a privileged
  operation unless it is also an authorized executor.
- `executor` is an authorized relayer/executor account. It can consume a recorded simulation
  but cannot create one, change any allowlist, or change any chain parameter.
- `signer` is the logical cross-chain authority whose authorization is being enforced. The
  contract treats the signer address as data; it never recovers a signature itself. Signature
  recovery remains the responsibility of the verifier layer documented in
  `docs/SIGNATURE_SPECIFICATION.md`.
- Chain-specific values (`enabled`, `requiredConfirmations`, `maxSimulationAge`) are explicit
  governance storage written by `setChainConfig`. They are never read from RPC, relayer
  messages or the simulation response itself. A missing TS chain policy denies the operation.
- Simulation is an attestation that an admin-observed `eth_call`/simulation succeeded and that
  it was bound to the exact `(operationId, signer, chainId, destination, selector, payloadHash)`
  tuple. The simulator is untrusted: the gate compares every returned field and the contract
  hashes the tuple into the attestation.

## Invariants

1. `destinationCount[signer]` equals the number of live `(chain, destination)` entries and
   `methodCount[signer]` equals the number of live selectors. Both are bounded by 64, so no
   execution path performs unbounded iteration.
2. `totalAuthorized` increases by exactly one for each successfully consumed operation and
   never changes on a revert, denial, retry or revocation.
3. A consumed `operationId` can never be consumed again, re-simulated, or revoked.
4. An authorization succeeds only when the signer is active, the chain is enabled, both
   allowlist entries are live, the simulation matches the full tuple, the simulation is not
   stale, and the configured confirmations have been observed.
5. A target-call failure bubbles up and reverts the whole transaction, so policy consumption
   and token balances are atomic. A failed attempt leaves the simulation available for retry.
6. Concurrent or interleaved admin changes between simulation and execution are fail-closed:
   revoking a signer, destination, method or chain invalidates an otherwise valid simulation.

## Behavior under partial failure, reorg and recovery

| Condition | Result |
| --- | --- |
| Simulator timeout or throw | Denied (`SIMULATION_UNAVAILABLE`); target is never called |
| Simulation reverted or field mismatch | Denied; target is never called |
| Simulation older than chain's `maxSimulationAge` | Denied (`SimulationStale`) |
| Fewer than `requiredConfirmations` blocks since attestation | Denied (`ConfirmationsNotMet`) |
| Chain disabled after attestation | Denied (`ChainDisabled`) |
| Destination or method revoked after attestation | Denied (`DestinationNotAllowed` / `MethodNotAllowed`) |
| Target token call reverts | Entire transaction reverts; simulation remains unconsumed and can be re-executed |
| Stale/reorged attestation detected by operator | Admin calls `revokeSimulation`; a fresh attestation can then be recorded |
| Duplicate/replayed message | Reverted (`MessageReplayed`) with no state change |

## Deployment, upgrade and migration

- Deploy `SignerPolicy` with an explicit admin and an explicit array of chain IDs and
  `ChainConfig` values. Keep the constructor arguments in the deployment manifest under
  version control; `POLICY_VERSION` is part of every operation hash, so a policy change that
  increments the version invalidates outstanding attestations by design.
- Grant executor rights to the narrowest set of relayer/executor addresses, then add signers,
  destinations and methods. Adding a signer does not grant it any destination or method: the
  default is deny-all.
- The contract has no upgrade mechanism. A configuration change is a set of admin calls; an
  intentional rule-change that must invalidate in-flight operations should be paired with a
  policy-version bump in a new deployment and a migration of pending operation IDs.
- Removal of a signer intentionally does not delete its allowlist entries (which would require
  unbounded iteration). The signer flag alone fails closed; operators should explicitly
  revoke destinations and methods during offboarding and verify `destinationCount` and
  `methodCount` reach zero.
- Monitor `AuthorizationGranted`, `SimulationRevoked`, `SignerUpdated`, `ExecutorUpdated`,
  `DestinationUpdated`, `MethodUpdated` and `ChainConfigUpdated`, and alert on any
  `AuthorizationGranted` whose destination or selector is absent from the governance record.
  Alert on repeated `SimulationStale` / `ConfirmationsNotMet` as an RPC or reorg signal.
- Emergency recovery: disable the affected chain with `setChainConfig`, revoke the affected
  simulation IDs, fix the upstream condition, re-enable the chain with an explicit
  confirmation window, re-record simulations, then retry. See also
  `docs/EMERGENCY_ROUTE_DISABLEMENT.md` and `docs/VALIDATOR_QUORUM_LOSS_RECOVERY_RUNBOOK.md`.

## Verification evidence

```sh
pnpm exec hardhat --config scripts/hardhat.signer-policy.config.ts compile
pnpm exec hardhat --config scripts/hardhat.signer-policy.config.ts test
pnpm exec jest --runInBand --runTestsByPath \
  src/security/simulation/privileged-operation-simulation-gate.spec.ts \
  --moduleFileExtensions ts json js
```

Measured on the local EDR chain: `authorizeAndConsume` with both allowlists at their 64-entry
limit used 71,084 gas; a policy-gated token transfer used 82,822-134,122 gas across the four
chain profiles. Both are bounded and independent of the number of allowlist entries.
The fuzz run executes 200 seeded transitions and asserts all six invariants after each step.

Passing tests are not a substitute for an independent audit of production contract changes.
This change adds test evidence and a self-contained reference policy; it does not by itself
authorize a mainnet deployment.
