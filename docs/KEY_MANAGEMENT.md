# Key Management and Signing Ceremony

Normative runbook for the keys BridgeWise uses in production: where each key comes from, which
component consumes it, how a signing operation is authorised, and what to do when a key has to be
backed up, rotated, or revoked in a hurry.

This document is written from the repository, not from a template. Every claim carries the file it
was read from, and §9 lists the places where the code and the existing documentation disagree —
those matter more than the happy path, because a ceremony that contradicts the code cannot be
followed during an incident.

**Status:** the API-side key handling below is implemented. The wallet transaction signing path is
still a placeholder in this repository (§4.3), so treat §5–§8 as the ceremony BridgeWise must have
in place before mainnet, with the implemented parts marked as such.

---

## 1. Scope

| Applies to | Location |
| ---------- | -------- |
| API authentication keys | `apps/api/src/security/` |
| Vault encryption key | `apps/api/src/security/api-key-vault.service.ts` |
| Wallet session encryption helper | `src/security/wallets/stellar/session-encryption.ts` |
| Cross-chain message signing | [`SIGNATURE_SPECIFICATION.md`](./SIGNATURE_SPECIFICATION.md) |
| Wallet transaction signing | `packages/adapters/stellar/src/executor/BridgeExecutor.ts` |
| Environment validation and audit | `apps/api/src/security/environment-security.validator.ts`, `apps/api/src/security/audit.script.ts` |

---

## 2. Key inventory

| Key | Purpose | Generation | Consumed by |
| --- | ------- | ---------- | ----------- |
| `VAULT_ENCRYPTION_KEY` | Encrypts stored API secrets (AES-256-GCM); also the key material for the wallet session helper | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` — see §9.1 | `api-key-vault.service.ts:32`, `session-encryption.ts` |
| `API_KEY` | Server-to-server API authentication | Issued per consumer; stored encrypted with `VAULT_ENCRYPTION_KEY` | `environment-security.validator.ts:80` (required in production) |
| `API_SECRET` | Paired secret for `API_KEY` | Same as above | `apps/api/src/security/` |
| `DB_PASSWORD` | Database credential | Issued by the database operator | `environment-security.validator.ts:80`, rotation policy `db-password` |
| Wallet / relayer signing keys | Sign transactions and validator attestations | Custodial by a wallet provider today; see §4.3 and §9.2 | `packages/adapters/stellar/src/wallet/`, `contracts/validator/` |

Variables are declared in [`.env.example`](../.env.example), with environment-specific copies in
`.env.staging.example` and `.env.production.example`. No key material may be committed: the
configuration service (`apps/api/src/config/config.service.ts:211`) only reads these names from the
environment.

---

## 3. Startup validation and audit

1. **Boot-time check.** `environment-security.validator.ts` refuses to start a production process
   without the required set (`API_KEY`, `DB_PASSWORD`, `VAULT_ENCRYPTION_KEY`, line 80) and reports
   a missing vault key separately (line 52).
2. **Config audit.** `audit.script.ts` scans the production configuration for the vault key and
   fails the audit if it is absent (`audit.script.ts:75`, `:88`). Run it as part of the release
   checklist, not only when something breaks.
3. **Fail-closed behaviour.** When `VAULT_ENCRYPTION_KEY` is missing, `ApiKeyVaultService`
   generates a random in-memory key and logs *"NOT FOR PRODUCTION"*
   (`api-key-vault.service.ts:33-37`). Consequence worth stating in the ceremony: in that state
   every secret stored through the vault is unreadable after a restart. The validator above is what
   prevents that state from reaching production.

---

## 4. Signing ceremonies

BridgeWise signs three different things, and they have different ceremonies. Do not conflate them.

### 4.1 API authentication (implemented)

`API_KEY`/`API_SECRET` authenticate server-to-server calls. Secrets are held in the vault, encrypted
with AES-256-GCM: the environment key is normalised to 32 bytes with SHA-256 before use
(`api-key-vault.service.ts:40-43`), so any sufficiently long, random value is acceptable **to the
vault**. Access to stored secrets is logged by the vault service, which is the audit trail for
"who could have used which key".

### 4.2 Cross-chain message signing (implemented, normative elsewhere)

Hashing, signing and verification of cross-chain messages are specified in
[`SIGNATURE_SPECIFICATION.md`](./SIGNATURE_SPECIFICATION.md), which binds every message verifier,
relayer client and destination-chain integration, including the Soroban verifiers and the validator
quorum attestation. This runbook does not restate that specification: a second copy would drift.

Key-management consequences to carry into the ceremony:

- Validator keys are **quorum material**: losing one reduces the quorum; leaking one allows forging
  attestations until the validator set is updated on-chain.
- Rotation therefore needs a two-phase flow — add the new validator key, wait for the on-chain
  update to confirm, then remove the old one — never a straight swap.

### 4.3 Wallet transaction signing (placeholder in this repository)

`BridgeExecutor` does not sign locally: it delegates (`packages/adapters/stellar/src/executor/BridgeExecutor.ts:82`)
to a wallet provider such as `FreighterProvider`. In this repository that provider is explicitly a
placeholder — `signTransaction()` carries the comment *"Simplified signing - in production use full
Freighter integration"* and derives its "signature" from a hex encoding of the transaction envelope
(`packages/adapters/stellar/src/wallet/FreighterProvider.ts:165-177`), which is not a cryptographic
signature.

**Consequence for the ceremony:** today the only real signing authority is the custodial wallet on
the client side; there is no server-held transaction signing key to protect, and no code in this
repository that would use one. Before mainnet, whoever owns the relayer or hot wallet must either
(i) keep signing client-side and document that the Action/API never holds transaction keys, or
(ii) implement a real signer and extend §5–§8 with its ceremony. Leaving this ambiguous is the
failure mode this document exists to prevent.

---

## 5. Backup

| Material | Requirement |
| -------- | ----------- |
| `VAULT_ENCRYPTION_KEY` | Sealed offline copy held by two custodians, separate from the environment it protects. Without it the vault contents are unrecoverable; with it alone they are readable. |
| `API_KEY` / `API_SECRET` | No backup needed: rotation is the recovery path (§6). Revoke and reissue instead of restoring. |
| `DB_PASSWORD` | Managed by the database operator's own backup/credentials process. |
| Validator / relayer keys | Only if the chain of custody allows export; otherwise recovery is re-registration on-chain, which requires the quorum procedure in §4.2. |

Rule that makes the rest work: **the sealed copy of the vault key must never be stored beside the
encrypted vault data.** A backup that shares a failure domain with the thing it protects is not a
backup.

---

## 6. Rotation

### 6.1 Implemented

`ApiKeyRotationService` (`apps/api/src/security/api-key-rotation.service.ts`) holds rotation policies
and runs a daily check at midnight (`:149`). Defaults created at startup (`:37-49`):

| Key | Interval | Auto-rotate |
| --- | -------- | ----------- |
| `api-key-main` | 90 days | yes |
| `api-secret-main` | 90 days | yes |
| `db-password` | managed by policy | per policy |

Rotations are appended to an in-memory rotation log (`KeyRotationLog`, `:5-10`) with the old key's
expiry outcome and the new key's expiry date, and a policy may name a notification address.

### 6.2 Operator procedure for `VAULT_ENCRYPTION_KEY` (not automated)

The vault key itself is **not rotated by the service above**, and rotating it is not a swap: the
ciphertext of every stored secret is bound to it.

1. Generate a new 32-byte value (§2) and add it to the environment as the *pending* key.
2. Re-encrypt stored secrets from the old key to the new one — decrypt with the old, encrypt with the
   new. Do this as an auditable script, not by hand, and log key **IDs only**, never values.
3. Verify: read back one non-critical secret through the vault under the new key.
4. Promote the new value to be the only `VAULT_ENCRYPTION_KEY`, restart, and confirm the boot
   validator passes (§3).
5. Destroy the old value and update the sealed backup, recording who witnessed the change.

### 6.3 What must be added before mainnet

- A documented cadence for validator/relayer keys, with the two-phase quorum flow of §4.2.
- Persistence for the rotation log (it is in memory today, so it is lost on restart).
- An explicit owner per key, so rotation is a scheduled task and not a reaction.

---

## 7. Access approval

- **Separation of duties:** the custodian of the sealed vault-key copy must not be the only person
  able to deploy the service. Two roles, two people, for anything in §5.
- **Least privilege:** `API_KEY`/`API_SECRET` are issued per consumer; there is no shared key for
  humans. A consumer that no longer exists is revoked, not left dormant.
- **Change record:** every rotation, revocation and backup update names the operator, the approver,
  the key ID and the timestamp. This is the evidence an audit asks for, and it costs nothing when it
  is written as it happens.
- **No key material in tickets, chat, commits or issue comments** — the issue for this document says
  the same, and the audit script in §3 is meant to fail a release when that rule is broken.

---

## 8. Emergency revocation

Order matters; the goal is to stop the bleeding, then learn why.

1. **Revoke first, investigate second.** Revoke the affected `API_KEY`/`API_SECRET` pair and confirm
   the consumer is rejected. A dormant but valid key is the incident.
2. **Vault key compromised** (held, printed or committed): treat every stored secret as disclosed.
   Rotate the upstream secrets at their source *before* re-encrypting the vault (§6.2) — re-encrypting
   a disclosed credential protects nothing.
3. **Validator or relayer key compromised:** remove the validator through the on-chain quorum
   procedure, then re-add a replacement (§4.2), and treat every attestation signed by that key
   between compromise and removal as suspect.
4. **After containment:** record the timeline, add the detection that would have caught it earlier,
   and re-run the config audit (§3).

---

## 9. Known inconsistencies found while writing this document

These are documented-versus-actual defects. Each one is cheap to fix and expensive to discover
during an incident.

### 9.1 The documented generation command and the session helper disagree on format

`apps/api/src/security/README.md:394` tells operators to generate the vault key with

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

which yields **64 characters**. The vault accepts it, because it hashes the value with SHA-256 first
(`api-key-vault.service.ts:40-43`). But the wallet session helper requires the key to be **exactly 32
bytes** and throws otherwise (`src/security/wallets/stellar/session-encryption.ts:16-22`).

The helper is currently exercised only by its own unit test
(`src/security/wallets/stellar/session-encryption.spec.ts`) — there is no production caller — so the
mismatch is latent today. Two ways out, and the choice belongs to the maintainers: document a
base64/passphrase form that satisfies both, or relax the helper's validation to match the vault's
normalisation. Until one is chosen, §2 recommends a base64 value so that a future caller of the
helper does not fail at runtime.

### 9.2 The wallet signing path is a placeholder

As stated in §4.3, `FreighterProvider.signTransaction()` does not produce a cryptographic signature.
Any documentation that describes a server-side signing ceremony today would be describing code that
does not exist. Implement a real signer, or state plainly that signing stays client-side — but do not
leave the two documents implying different things.

---

## 10. Operator checklist

- [ ] `VAULT_ENCRYPTION_KEY` present, 32-byte base64, held in the environment and in the sealed copy.
- [ ] Boot validator passes in production (`environment-security.validator.ts`).
- [ ] Config audit clean (`audit.script.ts`).
- [ ] Every `API_KEY` maps to a named, existing consumer.
- [ ] Rotation log exported/persisted for the last cycle.
- [ ] Sealed vault-key copy stored outside the deployment's failure domain, with two custodians.
- [ ] The signing path in use (§4.2 or §4.3) is the one documented for this environment.
- [ ] Emergency contacts for each role in §7 are current.

---

## 11. References

- [`.env.example`](../.env.example) — variable names
- [`SETUP_GUIDE.md`](./SETUP_GUIDE.md) — environment loading and secret handling
- [`SECURE_API_KEY_USAGE.md`](./SECURE_API_KEY_USAGE.md) — consumer-facing key usage
- [`SIGNATURE_SPECIFICATION.md`](./SIGNATURE_SPECIFICATION.md) — normative message signing
- `apps/api/src/security/api-key-vault.service.ts` — vault encryption
- `apps/api/src/security/api-key-rotation.service.ts` — rotation policies and daily check
- `apps/api/src/security/environment-security.validator.ts` — boot-time requirements
- `apps/api/src/security/audit.script.ts` — configuration audit
- `src/security/wallets/stellar/session-encryption.ts` — session encryption helper
- `packages/adapters/stellar/src/wallet/FreighterProvider.ts` — wallet signing (placeholder)
