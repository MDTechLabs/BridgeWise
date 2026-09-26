# #461 Stellar Provider Failover Simulator

This folder contains a provider failover simulator and a Jest test suite to validate:

- Provider outage simulation
- Failover behavior during route execution
- Generation of test reports/artifacts

## Run

From repo root:

- `npm test -- tests/failover/stellar/*.spec.ts`

## Outputs

The simulator writes per-run JSON reports under this directory.

