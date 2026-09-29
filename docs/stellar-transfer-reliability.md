# Stellar transfer reliability operations

## Automated checks

CI runs the transfer lifecycle and integration Jest suites before building. The
settlement verifier tests cover confirmed transfers, a confirmed source with a
missing destination, temporary RPC failures, and amount mismatches. Retry,
expiry, and rollback components also have focused unit tests. The integration
harness covers a successful bridge transfer and an insufficient source balance.

## Reconciliation and recovery

- A missing destination transaction after source confirmation is partial. Keep
  it under reconciliation. A destination release failure leaves the source
  amount locked in the harness; check both chains before initiating a retry,
  refund, or other compensating transfer.
- A mismatch in amount or settlement data requires manual review. Do not
  automatically retry a transfer whose on-chain outcome is ambiguous.
- Retry only transient failures, with bounded attempts and backoff. Confirm the
  transaction state before resubmitting so an uncertain prior submission cannot
  result in a duplicate transfer.
- Preserve transaction hashes, status transitions, and retry outcomes in
  operational logs. Never log signing keys, credentials, access tokens, or
  private production payloads.

## Production readiness note

The in-memory transaction status tracker contains a simulated RPC confirmation
path, and the rollback detector currently interprets `NOT_FOUND` as a revert.
Do not use either behavior as the sole production settlement authority until
RPC finality and temporary-not-found handling are backed by the target network's
operational policy.

The current npm dependency audit still reports two high severity advisories in
the legacy `stellar-sdk` transitive `toml` dependency. The suggested forced fix
downgrades the SDK to an incompatible old version; migrate the SDK dependency in
a separate reviewed change before treating the dependency audit as clean.
