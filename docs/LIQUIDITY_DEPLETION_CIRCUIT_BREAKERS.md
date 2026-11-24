# Circuit breakers for abnormal liquidity depletion

## Objective
Halt or rate-limit bridge activity when liquidity depletion exceeds safe thresholds, preventing cascade failures and insolvency.

## Circuit breaker types
- **Rate breaker**: depletion over rolling window exceeds threshold.
- **Absolute breaker**: available liquidity below minimum reserve.
- **Price/slippage breaker**: execution slippage exceeds cap.
- **Correlated-domain breaker**: multiple providers/assets in same domain fail.

## Policy
- Thresholds are per chain/asset/route and versioned.
- Breach triggers automatic pause or throttling according to severity.
- Manual override requires governance/multisig and is auditable.
- Recovery requires cooldown + healthy metrics + sign-off.

## Invariants
- Breaker cannot be bypassed by unauthorized caller.
- Protected outflows stop when breaker is open.
- Breaker decisions are deterministic for same inputs/policy.

## Verification
- Unit tests for threshold boundaries, rolling windows, and reset.
- Stateful/fuzz tests for concurrent withdrawals/depletion.
- Fork/integration tests per supported chain.
