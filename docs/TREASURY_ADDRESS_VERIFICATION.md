# Treasury and fee-recipient address verification

Normative reference for `scripts/treasury-address-verification.ts` (issue
#1524). The parameter set is `treasury-addresses/1.0.0`; the spec test enforces
that every invariant id and the parameter set stay documented here.

## Trust boundary

The reviewed, versioned `TreasuryPlan` is the sole source of expected values:
chain family, recipients, reserved roles, whether a recipient is a contract,
deployment block and confirmation depth. RPC reads are untrusted observations
at a single pinned block and are compared against that plan. A read failure,
malformed value, mismatch or burn address fails closed. Provider error strings
are never copied into a report. No transaction is sent and no production key
is used.

Authorization boundaries: only reviewers of the versioned plan define the
recipients; relayers and RPC providers have no authority to change them. A
verification run is read-only and cannot mutate protocol state.

## Address rules

- EVM addresses are canonical lower-case `0x` + 40 hex digits; mixed-case
  EIP-55 forms are rejected in the plan so there is a single canonical form.
- Stellar addresses are 56-character `G...` StrKey public addresses.
- Treasury and fee recipient must be distinct and must not match any reserved
  role (bridge, vault, validator, deployer) in the plan.
- Known burn addresses (zero address, `0x...dead`, Stellar black hole) are
  rejected in the plan and in observations.
- If the plan marks a recipient as a contract, the registry/recipient must have
  runtime code at the pinned block.

## Reorg and partial failure

All reads happen at `head - minConfirmations`, which must be at or after the
reviewed deployment block. A shallow pin, chain-id mismatch, missing runtime
code or failed read short-circuits to a failing report without using stale or
cached values. The model never infers chain-specific parameters from RPC data.

## Invariants

- `T-1` — expected recipients are well-formed for the reviewed chain family.
- `T-2` — treasury and fee recipient are distinct and not reserved roles.
- `T-3` — burn addresses are rejected in the plan and in observations.
- `T-4` — on-chain recipients match the reviewed addresses exactly.
- `T-5` — reads are pinned behind the confirmation depth and reorg-safe.
- `T-6` — any read failure or malformed value fails closed without leaking RPC errors.
- `T-7` — chain count is bounded and analysis work is constant per chain.

## Deployment, upgrade and recovery

- Rotating a recipient requires publishing a new versioned `releaseId`; the
  on-chain role must then be updated through its authorized owner flow and this
  check will fail until both agree.
- Run the check before signing a release and monitor it continuously; alert on
  any failed check.
- Recovery from a wrong-address incident follows the existing multisig owner
  rotation runbook; this model supplies evidence, not authority.
- Never log observed addresses from untrusted RPC into public artifacts; the
  report contains only stable check ids and statuses.

Release evidence: `scripts/treasury-address-verification.spec.ts` and the
multi-chain integration suite under `test/execution/`.
