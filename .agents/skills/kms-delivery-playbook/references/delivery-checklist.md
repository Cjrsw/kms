# KMS Delivery Checklist

## Source Discipline

Before implementation, read the smallest relevant set:

- `任务.md` for stable rules and current priorities
- `进度.md` for current state and blockers
- `docs/安全基线.md` for security-sensitive work
- the matching domain skill reference

## Implementation Discipline

- clarify whether the issue is scope, code, config, or runtime
- patch minimum required files
- avoid unrelated cleanup during a repair task
- preserve current API shapes unless the user asks for a change
- do not revive disabled features accidentally

## Verification Matrix

Pick the checks that match the touched modules:

- backend: `python -m compileall backend/app`
- embedding service: `python -m compileall embedding-service/app`
- frontend: `npm.cmd run build`
- docker/runtime: `docker compose ps` plus targeted service logs

## Browser Regression Targets

When UI or auth flow changes, cover the relevant subset of:

- login, logout, and 401 cleanup
- lockout message and unlock time display
- profile update and password change
- repositories, folders, notes, attachments
- search filters and author autocomplete
- QA page normal ask and stream ask
- admin users, departments, `Sys Prompt`, QA audit

## Reporting Discipline

- distinguish verified behavior from assumed behavior
- call out exact blockers
- say whether the blocker is code, config, dependency, or environment
- if docs were updated by request, mention which file and why

## Documentation Rule

- by default, do not modify `任务.md` and `进度.md`
- update them only under explicit user request
