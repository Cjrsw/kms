---
name: kms-security-baseline
description: KMS security baseline skill. Use when touching authentication, authorization, session handling, lockout, token lifecycle, CORS, password policy, account lifecycle, or security audit logging. Enforce the current baseline from `docs/安全基线.md` and prevent regressions.
---

# KMS Security Baseline

Use this skill for any security-sensitive change.

## Steps

1. Read `D:/program/code/kms/docs/安全基线.md`.
2. Read `references/security-checklist.md`.
3. Identify the affected security modules.
4. Run a before/after checklist against the baseline clauses.
5. Reject, narrow, or repair changes that weaken the baseline.
6. Produce a concise security impact summary with exact affected rules.

## Required Output

Always include:

- affected security modules
- baseline checks passed and failed
- config or migration impact
- rollback or mitigation notes

## Constraints

- Never weaken the current security baseline without explicit user approval.
- Preserve deterministic 401 cleanup, token invalidation, and lockout behavior.
- Keep security behavior auditable from the admin backend.
- If a security rule changes intentionally, update `docs/安全基线.md` in the same task.
