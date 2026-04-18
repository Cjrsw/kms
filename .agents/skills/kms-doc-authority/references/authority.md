# KMS Document Authority Baseline

## Source Order

When project information conflicts, use this order:

1. Latest explicit user instruction
2. `docs/安全基线.md`
3. `任务.md`
4. `进度.md`
5. Current code implementation

## How to Read This Order

- Use the higher-priority documents to decide intended behavior and current policy.
- Use code to verify what is actually implemented today.
- If code and higher-priority intent differ, report the mismatch before patching.

## What Each Source Owns

### `docs/安全基线.md`

- Non-regression security rules
- Auth, session, CORS, lockout, audit, password, account lifecycle controls

### `任务.md`

- Stable project goal and boundaries
- Stable product and architecture decisions
- Current priorities and acceptance targets
- Disabled capabilities that must not be reintroduced casually

### `进度.md`

- Current verified state
- Current blockers
- Current next steps
- Build/runtime status that may change soon

### Code

- Actual behavior at this moment
- Useful to confirm routes, response shapes, and implementation gaps
- Not sufficient by itself to justify restoring a deprecated feature

## Current Stable Policies To Preserve

- Runtime model policy is fixed by `.env`.
- Admin AI area keeps `Sys Prompt` and QA audit only.
- Dynamic model CRUD and user model preference remain disabled.
- Search and QA must enforce permission filtering.
- Model failures must stay structured; no silent fake answer fallback.

## Common Resolution Pattern

1. Read the relevant higher-priority doc.
2. Inspect code only for the touched module.
3. Separate three statements:
   - what the system should do
   - what the system currently does
   - what is blocked by environment or configuration
4. Patch code toward the higher-priority rule only when the user is asking for implementation or repair.
