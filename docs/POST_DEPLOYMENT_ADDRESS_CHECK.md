# Post-Deployment Oracle and Validator Address Check

`pnpm deployment:verify-addresses -- --network <name>` verifies, read-only, that the deployed `BridgeMultiOracle` and `ValidatorSetManager` are configured with exactly the reviewed addresses. It never signs or sends a transaction. A failed check sets a non-zero exit status. Implementation: `scripts/post-deployment-address-check.ts` (pure logic) and `scripts/post-deployment-address-check.cli.ts` (ethers adapter).

## Input

`POST_DEPLOYMENT_PLAN_PATH` points to reviewed JSON:

```json
{
  "chainId": 1,
  "deployedAtBlock": 19000000,
  "minConfirmations": 12,
  "oracle": { "address": "0x..", "primary": "0x..", "fallback": "0x..", "owner": "0x.." },
  "validatorSet": {
    "address": "0x..",
    "validators": ["0x..", "0x.."],
    "threshold": 2,
    "proposers": ["0x.."],
    "forbiddenRoleHolders": ["0x<deployer>"]
  }
}
```

All expected values come from this plan. RPC data is only the observation; nothing security-critical is inferred from it. `minConfirmations` is chain-specific and must be set per chain in the plan. The RPC URL comes from the protected `RPC_*` runtime settings, as for the [deployment preflight](./DEPLOYMENT_PREFLIGHT.md).

## Checks

| Check | Fails when |
| --- | --- |
| `plan:oracle-distinct`, `plan:threshold-majority` | The reviewed plan itself has identical feeds or a threshold that is not a strict majority |
| `chain-id` | The RPC reports a different chain; no further reads are made |
| `pinned-block` | Head is not at least `minConfirmations` past `deployedAtBlock`, or head is unreadable |
| `oracle:primary`, `oracle:fallback`, `oracle:owner` | Observed address differs from the plan, or is zero or malformed |
| `oracle:distinct-on-chain` | The two feeds are the same address on chain |
| `oracle:contract-code`, `oracle:primary-code`, `oracle:fallback-code`, `validators:contract-code` | No runtime code at the address |
| `validators:well-formed`, `validators:set` | Observed set has zero, malformed or duplicate entries, is over 256 entries, or differs from the plan (order and case are ignored) |
| `validators:threshold` | Observed `activeThreshold` differs from the plan |
| `validators:no-pending-proposal` | A validator-set proposal is pending |
| `validators:role:*` | A reviewed proposer lacks `PROPOSER_ROLE`, or a forbidden holder (typically the deployer) still holds `PROPOSER_ROLE` or `DEFAULT_ADMIN_ROLE` |

## Reorg and partial-failure behavior

All contract reads are pinned to block `head - minConfirmations`, so values are mutually consistent and a reorg of the newest blocks cannot turn into a pass. If the deployment is not yet that deep, the check fails with `pinned-block`. Any RPC error, timeout or malformed response fails the affected check; RPC error text is never copied into the report. The check is idempotent, so it is safe to re-run.

## Operations

- Run it after every deployment, after every validator-set rotation and role change, and as part of the [mainnet change approval](./MAINNET_CHANGE_APPROVAL_CHECKLIST.md) sign-off. Do not route traffic to the contracts until it passes.
- A pending proposal fails the check on purpose: activate or cancel it, then re-run against an updated plan.
- To recover from a failure, fix the configuration through the governed multisig/timelock path, wait for confirmations, and re-run. Do not edit the plan to match an unexplained observation.
- Archive the JSON report (it contains no secrets) with the change record. Alert on any failed run against production.
