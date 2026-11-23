# Audit finding traceability to code and regression tests

## Objective
Maintain end-to-end traceability from independent audit findings to code changes, regression tests, and verification evidence.

## Traceability matrix
| Finding ID | Severity | Component | Fix PR/Commit | Regression Test | Verification Evidence | Status | Owner |
|---|---|---|---|---|---|---|---|
| AUD-001 | High |  |  |  |  | open/fixed/verified |  |

## Requirements
- Every Critical/High finding must have a regression test.
- Test must fail before fix and pass after fix (evidence in PR/CI).
- Status cannot be "verified" without evidence link and reviewer sign-off.
- Traceability matrix updated in same PR as fix.

## CI/reporting
- Generate machine-readable findings registry (`audit/findings.json`).
- CI checks for missing regression test links on Critical/High findings.
