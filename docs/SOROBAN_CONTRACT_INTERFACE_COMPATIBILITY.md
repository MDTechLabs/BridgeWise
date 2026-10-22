# Soroban Contract Interface Compatibility

Issue: [#1335](https://github.com/MDTechLabs/BridgeWise/issues/1335)

BridgeWise verifies that a Soroban bridge contract exposes the interface the
router and execution paths expect before a route is enabled. The check is
off-chain and read-only: it never signs, submits, or mutates contract state.

## Public interface

```ts
import { SorobanContractCompatibilityChecker } from './src/soroban/compatibility';

const checker = new SorobanContractCompatibilityChecker();
const result = checker.check(resolvedMetadata);

if (!result.compatible) {
  // result.issues contains actionable, non-secret diagnostics
}
```

`check(metadata)` returns:

| Field             | Meaning                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `compatible`      | `true` only when no `error`-severity issue is present                   |
| `contractAddress` | Address echoed from the untrusted metadata input                        |
| `issues`          | Structured issues with `code`, `severity`, `message`, optional `method` |
| `verifiedMethods` | Required methods found on the contract                                  |
| `missingMethods`  | Required methods absent from the contract                               |

The default expected surface is `DEFAULT_BRIDGEWISE_SOROBAN_CAPABILITIES` in
`src/contracts/metadata/bridgewise-interface.ts`. Callers can supply a custom
`ExpectedContractCapabilities` with methods, events, errors, and a spec-version
prefix.

## Configuration

| Option              | Default                     | Behavior                                                             |
| ------------------- | --------------------------- | -------------------------------------------------------------------- |
| `specVersionPrefix` | `1`                         | A non-matching version produces `SPEC_VERSION_MISMATCH` as a warning |
| `methods`           | `bridge`, `quote`, `cancel` | Methods and argument names/types are required                        |
| `events`            | none                        | When configured, event names and field order/types are required      |
| `errors`            | none                        | When configured, error codes and names are required                  |

The metadata resolver (`SorobanContractMetadataResolver`) controls RPC source,
retry count, retry back-off, and cache TTL. Cache entries are scoped jointly by
contract address and network so testnet metadata can never be reused for public
network decisions.

## Failure semantics

| Code                         | Severity | Meaning                                                 |
| ---------------------------- | -------- | ------------------------------------------------------- |
| `METADATA_MISSING`           | error    | No metadata was resolved; do not route                  |
| `METADATA_NOT_READY`         | error    | Metadata status is unavailable, pending, or errored     |
| `INVALID_METADATA`           | error    | Missing address/network/functions or invalid containers |
| `INVALID_METHOD`             | error    | Method has no valid name or parameter list              |
| `INVALID_METHOD_PARAMETER`   | error    | Parameter has no valid name or type                     |
| `DUPLICATE_METHOD`           | error    | Method declared more than once                          |
| `DUPLICATE_METHOD_PARAMETER` | error    | Parameter declared more than once                       |
| `MISSING_METHOD`             | error    | Required method absent                                  |
| `ARGUMENT_COUNT_MISMATCH`    | error    | Required method has the wrong arity                     |
| `ARGUMENT_NAME_MISMATCH`     | error    | Argument names differ; positional callers may break     |
| `ARGUMENT_TYPE_MISMATCH`     | error    | Type differs after case/whitespace normalization        |
| `RETURN_TYPE_MISSING`        | error    | Required return type was not published                  |
| `RETURN_TYPE_MISMATCH`       | error    | Published return type differs                           |
| `MISSING_EVENT`              | error    | Configured event absent                                 |
| `EVENT_FIELD_COUNT_MISMATCH` | error    | Configured event arity differs                          |
| `EVENT_FIELD_NAME_MISMATCH`  | error    | Configured event field name differs                     |
| `EVENT_FIELD_TYPE_MISMATCH`  | error    | Configured event field type differs                     |
| `MISSING_ERROR`              | error    | Configured error code absent                            |
| `ERROR_NAME_MISMATCH`        | error    | Error code has a different name                         |
| `SPEC_VERSION_MISMATCH`      | warning  | Version prefix differs; review upgrade before routing   |

Treat RPC and contract metadata as untrusted input. A failed or malformed
resolution must fail closed: `compatible` is `false`, and no transaction should
be prepared or submitted from that result. Resolver failures are returned as an
error string, never as a compatible verdict.

## Idempotency and retries

Compatibility checks are pure and idempotent: the same metadata produces the
same result. RPC resolution retries transient fetch failures with exponential
back-off. Successful metadata is cached per address and network; force a refresh
after a contract upgrade. Repeated checks do not create routes, reserve
nonces, or submit transactions.

## Resource, gas, and upgrade impact

- The check runs off-chain and does not consume Soroban CPU instructions,
  ledger reads/writes, or network fees by itself.
- Cost is bounded by the number of resolved functions, their parameters, and
  configured events/errors: `O(functions + parameters + events + errors)`.
- Optional metadata fields are never parsed into executable payloads.
- A Soroban contract upgrade can change method names, argument types, return
  types, events, or error codes. Any error-level change blocks routing. A
  changed spec-version prefix is a warning so operators can review and
  re-enable routes deliberately.
- Re-run the compatibility check with `forceRefresh: true` after an upgrade;
  otherwise a cached pre-upgrade interface can mask the new surface.

## Observability

Operators should emit one structured log/metric per decision containing only:

- contract address, network, `compatible`, `verifiedMethods`, `missingMethods`
- issue `code`, `severity`, and `method`
- resolver cache hit/miss and retry count

Do not log private keys, signing material, access tokens, raw transaction
payloads, or full metadata `extra` blobs. The compatibility result intentionally
does not copy `extra` or other metadata payloads, which prevents accidental
secret propagation into logs.

Recommended alerts:

- any `error`-severity issue for a production route
- a sustained increase in `METADATA_MISSING` or RPC retries (provider outage)
- a `SPEC_VERSION_MISMATCH` warning after an announced upgrade

## Escalation

1. Fail closed and keep the affected route disabled.
2. Compare resolved metadata with the approved contract release and spec
   version.
3. If the change is expected, update the expected capabilities, run the
   compatibility tests, and obtain the normal route-enablement approval.
4. If the change is unexpected, treat it as a contract-integrity incident and
   escalate to the Stellar/Soroban and security owners.

## Verification

```bash
npx jest --runInBand tests/soroban/compatibility/soroban-contract-compatibility-checker.spec.ts
npx jest --runInBand test/integration/stellar/soroban-contract-interface-compatibility.spec.ts
```

The unit suite covers success, boundary, invalid-input, and failure cases. The
integration suite covers the resolver RPC/cache boundary, network isolation,
fetch retries, and fail-closed behavior for malformed metadata.
