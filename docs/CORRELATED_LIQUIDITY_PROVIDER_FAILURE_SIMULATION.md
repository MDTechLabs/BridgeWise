# Correlated liquidity provider failure simulation before route enablement

## Objective
Simulate correlated LP/adapter failures before enabling a route so BridgeWise does not enable routes that appear healthy under independent-failure assumptions but fail under correlated stress.

## Failure modes
- Multiple LPs share same custodian, chain, oracle, or RPC dependency.
- Stablecoin depeg or bridge asset impairment affects multiple routes.
- Liquidity withdrawal cascade causes slippage/fill failure.
- One provider outage triggers retries saturating others.

## Simulation requirements
- Model provider groups by correlation domain (custodian, chain, asset issuer, infra).
- Simulate single, pairwise, and domain-wide failures.
- Evaluate route success, slippage, time-to-fill, refund path, and accounting invariants.
- Block route enablement if correlated-failure loss exceeds configured risk threshold.

## Route enablement gate
| Metric | Gate |
|---|---|
| Fill success under correlated domain failure | >= policy threshold |
| Max expected loss / slippage | <= policy cap |
| Refund/recovery success | 100% for recoverable cases |
| Accounting invariant violations | 0 |

## Procedure
1. Define route, LP set, correlation groups, and thresholds.
2. Run deterministic simulation scenarios and randomized stress runs.
3. Produce report with failing scenarios and recommended cap/disable action.
4. Require risk sign-off before enabling route.

## Safety
- Simulation uses test/sandbox data; no production keys.
- Route enablement defaults to disabled on missing simulation evidence.

## Evidence
- Simulation report artifact.
- Threshold config version.
- Sign-off record.
