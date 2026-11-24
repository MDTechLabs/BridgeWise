# Release candidate security sign-off checklist

## Release metadata
- Release candidate: 
- Commit SHA: 
- Build artifact/provenance: 
- Target chains/contracts: 
- Change owner: 
- Date: 

## Required sign-offs (named)
| Role | Name | Decision | Date | Notes/Evidence |
|---|---|---|---|---|
| Security Lead |  | approve/block |  |  |
| Smart Contract Lead |  | approve/block |  |  |
| Backend/Relayer Lead |  | approve/block |  |  |
| QA/Testing Lead |  | approve/block |  |  |
| Operations/On-call Lead |  | approve/block |  |  |
| Compliance/Risk (if applicable) |  | approve/block |  |  |

## Gate checks
- [ ] No unresolved Critical/High security findings.
- [ ] Audit findings traced to code, tests, and status.
- [ ] Unit/fuzz/invariant/fork tests passed in CI.
- [ ] Mutation testing threshold met for critical auth/accounting checks.
- [ ] Deployed bytecode and constructor config verified.
- [ ] Rollback/recovery runbook reviewed and rehearsed.
- [ ] Monitoring/alerting and pause controls verified.
- [ ] Secrets/keys not present in logs/tests/artifacts.

## Evidence links
- CI runs: 
- Audit report/findings tracker: 
- Test/fuzz/mutation reports: 
- Deployment verification: 
- Runbook drill record: 

## Final decision
- [ ] Release approved
- [ ] Release blocked (reason): 
