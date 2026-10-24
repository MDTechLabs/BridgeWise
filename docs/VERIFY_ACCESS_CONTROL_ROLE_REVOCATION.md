# Verify Access-Control Role Revocation Behavior

## 1. Overview
This specification and implementation defines the behavior, public configuration interface, and runtime guarantees for verifying access-control role revocation across BridgeWise's cross-chain routing and execution boundary.

## 2. Scope & Boundaries
- **Workstream**: Smart Contract Safety
- **Target Contract**: `contracts/BridgeCoreAccessControl.sol`
- **Interfaces & Roles**:
  - `DEFAULT_ADMIN_ROLE`: Role administrator capable of granting, revoking, and authorizing UUPS contract upgrades.
  - `EXECUTOR_ROLE`: Privileged role authorized to trigger `executeCrossChainTransfer`.
  - `OPERATOR_ROLE`: Operational role authorized to run diagnostics and execute `verifyRoleRevocation`.
  - `ROUTER_ROLE`: Routing boundary adapter role.

## 3. Invariants & Security Guarantees
1. **Immediate Revocation**: When an account's role is revoked via `revokeRole`, subsequent calls requiring that role fail immediately (`AccessControlUnauthorizedAccount`).
2. **Revocation Verification**: Operators can programmatically verify and emit immutable audit evidence via `verifyRoleRevocation(role, account)`. If the role is still active, the transaction reverts with custom error `RoleNotRevoked(role, account)`.
3. **Idempotency & Replay Protection**: `executeCrossChainTransfer` records transfer status in `executedTransfers[transferId]`. Duplicate calls revert with `TransferAlreadyExecuted(transferId)` and emit `ExecutionAttemptRejected(transferId, caller, reason)` for operational triage.
4. **Boundary Validation**: Validates recipient (rejects `address(0)`) and amount (rejects `0`), preserving asset and chain boundaries.
5. **No Secrets / Auditable Logging**: Emitted events (`TransferExecuted`, `RoleRevocationVerified`, `ExecutionAttemptRejected`) log only public identifiers (`bytes32 transferId`, `bytes32 role`, `address account`) without sensitive payloads, private keys, or signer tokens.

## 4. Gas & Upgrade Implications
- **Gas Impact**: Role-based access control checks leverage OpenZeppelin v5 bitmasks and mappings. Gas overhead for verification is minimal (<35k gas for diagnostic calls).
- **UUPS Upgrade Safety**: Inherits `UUPSUpgradeable` with a dedicated 50-slot storage gap (`uint256[50] private __gap`), ensuring future upgrades do not collide with proxy storage slots. Role configurations and transfer state persist seamlessly across implementation upgrades.
- **Upgrade Authorization**: Restricted exclusively to `DEFAULT_ADMIN_ROLE`.

## 5. Failure Semantics & Escalation Paths
- **Unauthorized Role Revocation Check**: Throws `AccessControlUnauthorizedAccount`. Escalation: Operator credentials must be checked.
- **Role Still Active**: Reverts with `RoleNotRevoked(role, account)`. Escalation: Admin multisig must execute `revokeRole` before clearing incident quarantine.
- **Duplicate Execution Attempt**: Reverts with `TransferAlreadyExecuted(transferId)`. Escalation: Replay attempt logged in metrics; relayer queue notified.
