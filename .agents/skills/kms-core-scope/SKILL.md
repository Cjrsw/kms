---
name: kms-core-scope
description: KMS scope and boundary skill. Use when clarifying what the current MVP should do, should not do, which modules a request belongs to, whether a feature is already implemented, disabled, or out of scope, and what the minimum acceptable in-scope change is.
---

# KMS Core Scope

Use this skill to prevent scope drift and requirement misunderstanding.

## Steps

1. Read `references/scope.md`.
2. Map the request to one or more scope modules.
3. Mark each requested item as `in_scope`, `partially_in_scope`, or `out_of_scope`.
4. If the request revives a disabled feature or expands beyond MVP, propose the smallest acceptable in-scope alternative.
5. Return the scope impact for data model, API, frontend, runtime, and docs.

## Output Template

- Scope classification
- Current baseline
- Proposed in-scope change
- Acceptance checks
- Risks and open decisions

## Constraints

- Keep MVP-first decisions.
- Do not silently expand requirements across unrelated modules.
- Preserve current stable policies from `任务.md`, especially fixed-model QA and disabled dynamic model governance.
- Treat temporary blockers in `进度.md` as delivery status, not as product scope.
