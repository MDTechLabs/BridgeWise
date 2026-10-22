# Route parameter fuzz tests (`BridgeRoute`)

`test/bridge/BridgeRoute.fuzz.test.ts` fuzzes the bounds of `setRoute`, `setAssetCompatible`
and `validateRoute` in `contracts/bridge/route.sol`. It uses a seeded PRNG, so runs are reproducible.

```bash
pnpm exec hardhat test test/bridge/BridgeRoute.fuzz.test.ts
FUZZ_SEED=42 FUZZ_RUNS=600 pnpm exec hardhat test test/bridge/BridgeRoute.fuzz.test.ts
```

| Variable    | Default | Meaning                           |
| ----------- | ------- | --------------------------------- |
| `FUZZ_SEED` | `1310`  | PRNG seed                         |
| `FUZZ_RUNS` | `150`   | Iterations per property           |

A failure message starts with `[FUZZ_SEED=… run=… inputs=…]`; rerun with that seed to replay it.
Inputs include edge values: 0, 1, 9_999, 10_000, 10_001, `2^255`, `type(uint256).max / 10_000` (+1), `type(uint256).max`, chain ids `0` and `2^32-1`.

## Invariants checked

- `setRoute` accepts exactly `maxSlippageBps, maxFeeBps ∈ [0, 10_000]`, stores them unchanged, and emits `RouteConfigured`. Out-of-range values revert and leave state untouched.
- Zero token reverts `ZeroAddress` (also for `setAssetCompatible`). Non-admin callers always get `AccessControlUnauthorizedAccount`, before any validation.
- `validateRoute` equals an exact BigInt model of the contract: floor division, check order (support → asset → slippage → fee), and the exact boundary (a value of exactly the limit passes, one unit more fails).
- Overflow in `(amount - expected) * 10_000` or `fee * 10_000` reverts with Panic `0x11`; it never wraps and passes (fails closed).
- Monotonic: a higher `expectedAmount` or a lower `fee` never turns a pass into a failure.
- Routes are keyed by `(src, dst, token)` and directional; an unconfigured key is never supported.

## Known gaps (pinned, not endorsed)

The last `describe` block asserts today's behavior so that a fix is a deliberate test change.

1. `amount == 0` skips both slippage and fee checks.
2. `exposureLimit` is stored but never enforced.
3. `setRoute` resets `assetCompatible` to `true`, overriding an admin's `setAssetCompatible(false)`.
4. Chain ids are unbounded (`0`, and `src == dst`, are accepted).
5. Out-of-range bps reverts with `ZeroAmount`, which is misleading.

## Failure semantics, gas and upgrades

- All failures are reverts with custom errors or Panic; there is no partial state change.
- No contract changes were made: no gas, storage-layout or interface impact. `BridgeRoute` is not upgradeable, so fixing the gaps above means a redeploy and re-running `setRoute` for existing routes.
- Tests log nothing and use only synthetic addresses and amounts (no keys, tokens or payloads).
