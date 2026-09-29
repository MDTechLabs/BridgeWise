# Production key management runbook

This runbook covers service credentials and the `VAULT_ENCRYPTION_KEY`. Treat blockchain signing keys and seed phrases as a separate, higher-risk class: keep them in an HSM or qualified custody service, and never load them into this API vault or ordinary application environment variables.

## System boundaries and known limits

- The secrets manager is the source of truth for production credentials. Inject values into the process at deployment time; do not commit them, pass them as build arguments, put them in images, or paste them into tickets, chat, terminal transcripts, or CI logs.
- `ApiKeyVaultService` currently keeps encrypted values in a process-local `Map`. It is not a durable or shared secret store. A restart or replica change loses values stored through `storeKey`; do not use it as the only copy or expect replicas to share keys.
- `ApiKeyRotationService` runs a daily age check and marks keys for rotation. Its `autoRotate` policy does not create credentials at an issuer or update the deployment secret store. Notifications are not wired up.
- `rotateKey` replaces the value in the local map immediately. It does not provide an overlap window or update the provider. Coordinate provider-side overlap and workload rollout through the procedures below.
- The application derives its AES key by SHA-256 hashing the `VAULT_ENCRYPTION_KEY` string. Supply a uniformly random 32-byte value encoded as 64 hexadecimal characters. Losing this value makes ciphertext encrypted with it unrecoverable; changing it without re-encrypting any retained ciphertext also prevents decryption.

## Create a key

1. Identify the credential owner, service, environment, required permissions, expiration, and rotation date. Request the narrowest scopes and network restrictions the issuer supports.
2. Create provider credentials in the provider's approved console or API. Use separate credentials for staging and production; never reuse developer credentials.
3. For `VAULT_ENCRYPTION_KEY`, generate 32 random bytes using an approved secret manager's generator or a cryptographically secure generator such as `crypto.randomBytes(32)`. Encode as hex only if the secret manager or runtime interface requires text. Do not print the result into a recorded terminal or CI job.
4. Store the value directly in the production secret manager under a stable, nonsecret identifier. Configure the workload identity to read only the required secret at runtime. Set an expiry and owner metadata where supported.
5. Deploy to a nonproduction environment first. Verify startup, the narrow intended integration, and that logs contain only secret identifiers or status, never values.

## Backup and recovery

- Back up secret-manager records using its encrypted, versioned backup or replication feature. Keep recovery material under separate administrative control from the running workload; require two authorized custodians for emergency recovery.
- Keep prior secret versions only for the approved rollback window. Restrict restore permission separately from routine read permission, and audit every access and restore.
- Exercise recovery in an isolated nonproduction environment. Confirm the application can start and the provider accepts the restored credential without copying production values into the test environment.
- Back up `VAULT_ENCRYPTION_KEY` separately from any ciphertext it protects. Store key versions and rotation metadata, not plaintext key values, in change records. For the current process-local vault, restart loses its in-memory entries, so recovery must repopulate credentials from the secret manager.
- If the encryption key is lost, do not overwrite it and assume existing ciphertext will remain readable. Restore the matching protected version or follow a planned decrypt-and-re-encrypt migration while the old key remains available.

## Approval and access

1. Open a restricted change request naming the service, environment, secret identifier, scope, reason, owner, requested duration, rollout window, and rollback plan. Never include the secret value or a reversible encoding of it.
2. Require approval from the service owner and a separate security or production approver before creating, reading, restoring, rotating, or revoking a production secret. The requester must not approve their own request.
3. Grant least-privilege, time-bounded access through named identities. Prefer workload identity and short-lived access over shared human credentials. Review membership and access logs at least quarterly and remove access when the task ends or the owner changes.
4. Record approver identities, secret identifier/version, timestamps, actions, deployment revision, and outcome in the restricted audit record. Do not record values, full environment dumps, or screenshots of secret-manager contents.

## Routine rotation

1. Schedule rotation based on issuer capability, credential impact, and risk; rotate immediately after suspected exposure or access-policy changes. The service's default intervals are advisory checks only and do not replace this procedure.
2. Obtain the approvals above. Create a second provider credential when overlap is supported, store it as a new version in the secret manager, and update the runtime reference.
3. Roll out to one instance or a canary. Confirm health checks and a harmless authenticated operation using status codes and request IDs only. Do not log authorization headers or response bodies containing credentials.
4. Roll out to all instances, confirm the old credential is no longer used, then revoke it at the issuer. Remove the prior secret version after the rollback window and audit the change.
5. If the issuer cannot overlap credentials, use an approved maintenance window and explicit rollback plan. Do not call the in-memory `rotateKey` method as a substitute for issuer rotation or secret-store updates.

## Emergency revocation

1. Declare an incident and notify the security/on-call owner through the private incident channel. Preserve relevant access and deployment logs without copying secret values.
2. Revoke or disable the credential at its issuer first. For blockchain signing credentials, follow the chain-specific containment plan; an exposed private key generally cannot be revoked, so transfer authority or assets using the approved recovery procedure.
3. Disable the corresponding secret version, create a replacement with minimum required scope, and update the runtime secret reference. Restart or roll all affected instances so no process retains the old value.
4. Where the API vault currently holds the affected key in memory, call `revokeKey` to disable it in that process as an additional containment step; this is not a substitute for issuer revocation and does not propagate to other replicas.
5. Verify the old credential is rejected at the issuer and the replacement integration is healthy. Review issuer and workload audit logs for misuse, rotate related credentials if exposure may have crossed trust boundaries, and document impact and follow-up actions in the restricted incident record.

## Completion checklist

- [ ] Owner, approver, scope, expiry, and rotation date recorded without secret material.
- [ ] Production value is stored only in the approved secret manager and injected at runtime.
- [ ] Recovery version exists and restore was tested in nonproduction.
- [ ] Workload access is least-privilege and auditable.
- [ ] Rotation or revocation was verified at the issuer and across all running instances.
- [ ] Logs, tickets, and CI output contain no values or environment dumps.
