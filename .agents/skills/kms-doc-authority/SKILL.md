---
name: kms-doc-authority
description: Resolve KMS documentation and code conflicts. Use when a request depends on the latest project truth, when `任务.md` / `进度.md` / `docs/安全基线.md` may disagree with code, when deciding whether a feature is current, deprecated, or blocked, or before reviving an older design.
---

# KMS Document Authority

Use this skill to decide which project source is authoritative before coding.

## Steps

1. Read `references/authority.md`.
2. Classify the question as one of:
   - intended behavior
   - current implementation
   - blocker / runtime status
   - deprecated or disabled capability
3. Apply the documented source order.
4. Compare the higher-priority source with the current code when implementation matters.
5. State any mismatch explicitly before proposing or making changes.
6. Hand off to the narrower domain skill after the conflict is resolved.

## Output Template

- Source order used
- Intended behavior
- Current implementation
- Mismatch or alignment
- Recommended action

## Constraints

- Do not silently revive deprecated capabilities.
- Do not treat a temporary blocker in `进度.md` as a permanent architecture rule.
- Do not overwrite `任务.md` or `进度.md` unless the user explicitly asks.
- If code diverges from the higher-priority source, call that out instead of guessing which side is correct.
