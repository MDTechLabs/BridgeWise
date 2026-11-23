# Deployment Provenance Record

Each production contract deployment gets one immutable provenance entry that ties the deployed address to the exact source commit and compiler settings that produced it. Implementation: `scripts/deployment-provenance.ts`.

## What is recorded

`chainId`, `contractName`, `contractAddress`, `sourceCommit` (full 40 or 64 hex commit id), `compiler` (`solcVersion` exact, `evmVersion`, `optimizer.enabled/runs`, `viaIR`, `metadataBytecodeHash`), `runtimeCodeSha256` (SHA-256 of the reviewed build's runtime bytecode), `deployTxHash`, and the authenticated `recordedBy` recorder. Schema version is `1`; bump it on any field change so old entries stay verifiable.

## Trust assumptions and authorization

- Commit, compiler settings and runtime code hash come from the reviewed local build. They are never taken from RPC or relayer data. `resolveCleanGitCommit` refuses a dirty working tree so the commit describes the compiled sources.
- Only addresses in the reviewed `authorizedRecorders` set can append. `recordedBy` is set from the authenticated recorder; a caller-supplied value is ignored.
- Entries are hash-chained (SHA-256 over canonical JSON, starting from an all-zero genesis hash). Editing, removing, reordering or duplicating any entry fails `TAMPERED_LEDGER` on load and blocks further appends.
- A `(chainId, contractAddress)` pair can be recorded once. Replays and conflicting rewrites fail `DUPLICATE_RECORD`. Every rejected append leaves memory and the file unchanged.
- The ledger is append-only JSON lines. Existing lines are re-verified on every call and never rewritten.

## Verification

`verifyDeployedProvenance` returns per-check results (`entry-hash`, `source-commit`, `compiler-settings`, `recorded-code-hash`, `onchain-code-hash`). It compares the recorded entry with the reviewed build and with `getCode` at the address. RPC errors, empty or malformed code fail closed, and error text is not copied into the report.

## Reorgs and partial failure

Record only after the deployment transaction has reached the finality your chain policy requires. If the deployment is reorged out, the entry is wrong and cannot be edited: record a corrected deployment at its new address, and treat the old entry as superseded in the incident notes. If a deployment succeeds but recording fails, the contract has no provenance entry; do not route traffic to it until `verifyDeployedProvenance` passes after a successful append.

## Operations

- Back up the ledger file with the release artifacts and store its head hash (`ledger.headHash`) in the change-approval record. Anchoring the head hash on-chain or in a signed release tag is a recommended follow-up.
- Alert on `TAMPERED_LEDGER`, `UNAUTHORIZED_RECORDER` and `DUPLICATE_RECORD`; none should occur in a normal deployment.
- Rotating recorders means starting the next release with a new reviewed `authorizedRecorders` set. Existing entries keep their original `recordedBy`.
- Upgradeable proxies: record the implementation address for every upgrade (each has its own code hash), and the proxy address once at creation.
