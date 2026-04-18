---
name: kms-delivery-playbook
description: KMS implementation playbook skill. Use when executing feature work, repair work, or integration work end to end with controlled scope, targeted verification, docker-based runtime checks, and concise reporting aligned with the current KMS docs.
---

# KMS Delivery Playbook

Use this skill to execute development work consistently.

## Steps

1. Read `references/delivery-checklist.md`.
2. Identify which domain skills and source documents are needed.
3. Build a minimal implementation plan.
4. Implement changes in small verifiable slices.
5. Run compile/build checks and runtime checks that match the changed modules.
6. Report results with concrete verification evidence and explicit blockers.

## Mandatory Reporting

- what was changed
- what was verified
- what remains blocked

## Constraints

- Keep changes aligned with the current architecture and scope.
- Avoid broad refactors unless the user explicitly asks.
- Separate code defects from environment or configuration blockers.
- Do not edit `任务.md` or `进度.md` unless the user explicitly asks.
- When runtime verification is blocked, provide the exact command or log that proves the blocker.
