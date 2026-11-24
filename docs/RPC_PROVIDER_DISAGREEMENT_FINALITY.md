# RPC provider disagreement before finality decisions

## Objective
Prevent finality-sensitive actions (execution, refunds, settlement, monitoring alerts) from proceeding when independent RPC providers disagree about chain state. BridgeWise must fail safely: disagreement is treated as unknown, not as confirmation.

## Affected components
- Relayer/read paths that consume block headers, receipts, confirmations, and finalized tags.
- Finality gating in bridge execution and refund flows.
- Monitoring/alerting that may trigger operator actions.
- Chain configuration: per-chain confirmation depth, finalized tag policy, provider quorum, and observation window.

## Trust assumptions
- RPC providers can be stale, partitioned, buggy, rate-limited, or adversarial.
- A single provider response is untrusted for security-critical decisions.
- Chain-specific finality is explicit and versioned; never inferred from RPC metadata alone.

## Policy
1. **Provider quorum**: require at least `N>=2` independent providers for finality decisions. Configure `quorum` and `minAgreement` per chain.
2. **Agreement rule**: providers agree only when security-critical fields match after normalization:
   - chain ID
   - block number/hash for queried height
   - tx/receipt status and block inclusion
   - finalized/safe tag mapping per chain policy
   - confirmation depth >= configured minimum
3. **Disagreement handling**: if providers disagree, mark state `UNKNOWN`, block finality-dependent mutation, emit alert, and retry with backoff.
4. **Reorg/finality lag**: if any provider reports non-final or reorg depth uncertainty, treat as unknown until confirmation window passes.
5. **Auditability**: log provider ids, queried heights/hashes, decision, and policy version without secrets.

## Invariants
- No protected state mutation on disagreeing/insufficient quorum.
- No replay/double-settlement caused by stale provider read.
- Finality decision is deterministic for same inputs and policy version.
- Fail-closed on timeout, parse error, or missing provider.

## Recovery
- Operators investigate provider drift, switch unhealthy provider, and re-run read after confirmation window.
- User-facing flows remain pending/retriable; no irreversible action taken from disputed state.

## Verification
- Unit tests cover agreement, disagreement, timeout, malformed response, and boundary confirmation depths.
- Fuzz/invariant-style tests cover multi-read transitions and repeated disagreements.
- Fork/integration tests should run per supported chain with configured provider sets before release.
