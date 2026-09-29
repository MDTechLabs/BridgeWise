# Contract Upgrade and Accounting Controls

## Upgrade Authorization and Immutability

The Solidity contracts in this repository are deployed as direct contracts; no proxy, UUPS, or delegatecall-based implementation upgrade path is provided. Deployed contract code is therefore immutable. Changes to code require a new deployment and an operational migration of integrations and state.

`ZKVerifierRegistry` is the explicit exception for replaceable behavior: it stores verifier addresses by chain, and `registerVerifier` can replace a verifier. Both registration and removal require `VERIFIER_ADMIN_ROLE`. That role is administered by `DEFAULT_ADMIN_ROLE`; the deployment admin is nonzero-validated but is not automatically granted verifier-update authority. A default administrator must deliberately grant the update role. In production, assign the default-admin role to a governed multisig or timelock and grant `VERIFIER_ADMIN_ROLE` only to the intended governed executor. Monitor role grants/revocations and `VerifierRegistered`, `VerifierUpgraded`, and `VerifierRemoved` events. Verify a replacement verifier's deployed code, circuit/version metadata, and proof behavior before authorizing the update.

Immutability does not mean all state is fixed. `DynamicFeeDistribution` has mutable fee splits, payout destinations, and ownership; `FlashLoanGuardVault` has an immutable underlying asset but an owner-controlled pause; and the verifier registry has mutable verifier mappings and metadata. The timelock's delay and roles are governance configuration, not code upgrades. Treat all privileged roles and ownership transfers as production-critical changes.

## Accounting Invariants

The following checks describe the expected accounting for standard, non-rebasing ERC-20 assets:

- Fee conservation: for each token, `totalFeesDistributed <= totalFeesCollected`; available fees are `totalFeesCollected - totalFeesDistributed`. A distribution cannot exceed that available amount.
- Fee allocation: burn, treasury, and relayer transfers sum exactly to the distribution amount. Integer-rounding remainder is assigned to the relayer allocation. All destinations must be configured, so a successful distribution cannot be recorded while an allocation remains in the distributor.
- Vault liquidity: `totalAssets()` equals the underlying token balance held by `FlashLoanGuardVault`. Deposits transfer assets into the vault and mint proportional shares; withdrawals burn shares and transfer the corresponding proportional assets. Share rounding can leave residual assets in the vault.
- Settlement: a bridge settlement must consume a previously accepted message/claim at most once, and the source-side debit and destination-side credit must represent the same bridged amount, subject only to explicitly recorded fees. Per-chain operational reconciliation should compare accepted, settled, refunded, and pending messages; the Solidity fee and vault contracts do not independently prove cross-chain settlement finality.

## Verification and Operations

Run the contract-focused tests after changes to these controls:

```sh
pnpm exec hardhat test test/fees/DynamicFeeDistribution.test.ts test/zk/ZKVerifierRegistry.test.ts test/vault/FlashLoanGuardVault.test.ts
```

Monitor fee collection/distribution totals against token balances and payout events. Reconcile vault share supply against asset balances and investigate unexplained balance changes (including rebases or token-side transfer fees). A successful EVM transaction only establishes local execution; cross-chain settlement requires independent source/destination finality and message reconciliation.