# Production deployment guard

Normative reference for `scripts/production-deployment-guard.ts` (issue #1525).
The parameter set is `deployment-guard/1.0.0`; the spec test enforces that every
invariant id, mainnet chain and the parameter set stay documented here.

## Trust boundary

This is a pure, offline gate: it classifies a checked-in `DeploymentManifest`
against explicit, versioned tables (`MAINNET_CHAINS`, `TESTNET_CHAIN_IDS`,
`STELLAR_TESTNET_PASSPHRASES`, `APPROVED_MAINNET_ADDRESSES`,
`KNOWN_TESTNET_ADDRESSES`). It never reads an RPC, relayer, environment variable
or contract self-description. A chain is production-ready only if it is on the
mainnet allowlist **and** absent from the testnet list; unknown chains fail
closed. The approved inventory contains non-production placeholders; a real
release must publish a new parameter set with the restricted deployment
inventory before activation.

Authorization boundaries: only the release process that produces the reviewed
manifest can set a release id and source commit. The gate has no authority to
change addresses or chain ids, and cannot be satisfied by relayer-supplied data.

## Approved mainnet chains

The versioned mainnet allowlist is explicit: `evm:1`, `evm:10`, `evm:56`,
`evm:137`, `evm:8453`, `evm:42161`, and the Stellar public network. Any other
chain id — including all known testnets — fails closed.

## What is checked

- `environment` must be `production`.
- EVM chain ids must be explicit mainnets and never known testnets; the network
  label must match the reviewed mainnet label.
- Stellar manifests must target `stellar-public`, never a test or standalone
  passphrase.
- All five role addresses (deployer, bridge, treasury, fee recipient, admin)
  must be well-formed for the chain family, distinct, not burn/testnet-only,
  and — for EVM — in the approved per-chain inventory.
- `sourceCommit` must be a pinned 40-hex git commit; `releaseId` and parameter
  set version must match the reviewed policy.

## Invariants

- `G-1` — manifest fields and address formats are validated before classification.
- `G-2` — known testnet chain ids are always rejected.
- `G-3` — only explicitly approved mainnet chains pass.
- `G-4` — the network label must match the reviewed mainnet; labels cannot override chain ids.
- `G-5` — role addresses are distinct, well-formed and non-burn.
- `G-6` — known testnet-only addresses are rejected.
- `G-7` — addresses must be in the reviewed per-chain inventory.
- `G-8` — the gate is pure and bounded; no RPC input, unbounded loop or secret can influence it.

## Deployment, upgrade and recovery

- Run this guard in CI on the exact manifest used for deployment, and again in
  the deployment entrypoint before any signing step; abort on any failed check.
- A blocked deployment must not be "fixed" by changing labels or addresses in
  the field. Publish a new versioned parameter set with reviewed values.
- Recovery from an accidental testnet deployment follows the existing incident
  and upgrade-rollback runbooks; preserve the failed report as evidence.
- Release evidence includes the reproducible build artifact and verified
  deployed bytecode (see `verify-bytecode.ts`) for the pinned `sourceCommit`.

Release evidence: `scripts/production-deployment-guard.spec.ts` and the
multi-chain integration suite under `test/execution/`.
