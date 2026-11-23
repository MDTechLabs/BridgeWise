# Block release on unresolved critical and high-severity contract findings

## Objective
Prevent release candidates from shipping when Critical or High severity contract/security findings remain unresolved.

## Policy
- Release gate fails if any finding with severity `critical` or `high` is `open`, `accepted-risk` without approved exception, or `unverified`.
- Allowed states for release: `fixed+verified`, or `false-positive` with security lead approval.
- Exceptions require explicit, time-bound risk acceptance by named approvers and compensating controls.

## Enforcement
- CI job reads findings registry/report (JSON/YAML) and exits non-zero on blocking findings.
- PR/release checklist must link findings report.
- Audit traceability matrix must map finding -> fix commit -> regression test -> verification evidence.

## Evidence
- Findings report artifact
- CI gate output
- Sign-off record
