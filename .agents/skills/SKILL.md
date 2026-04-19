---
name: kms-dev-assistant
description: 协助开发、联调和修复 KMS（企业知识管理系统）MVP。遇到 Next.js、FastAPI、Docker、安全基线、知识库内容管理、全文检索、RAG 问答、QA 流式输出或文档与代码冲突判定任务时使用；先按 `任务.md`、`进度.md` 与 `docs/安全基线.md` 对齐真实状态，再选择对应子 skill。
---

# KMS Dev Assistant

Use this skill as the repo-level dispatcher for KMS work.

## Steps

1. Read `任务.md` and `进度.md` before changing assumptions.
2. If the request involves requirement conflict, stale docs, or scope ambiguity, use `kms-doc-authority` first.
3. Route the request to the narrowest matching domain skill:
   - scope and acceptance -> `kms-core-scope`
   - auth, session, CORS, audit -> `kms-security-baseline`
   - search, recall, QA, streaming -> `kms-rag-search-qa`
   - end-to-end implementation and verification -> `kms-delivery-playbook`
4. Keep the current stable project facts in mind:
   - chat and embedding runtime are fixed by `.env`
   - admin AI area only keeps `Sys Prompt` and QA audit
   - admin backend uses an independent `AdminShell`; do not mix it back into the front-office sidebar
   - admin overview should stay lightweight until stable analytics fields exist; do not invent performance or token metrics without real backend records
   - dynamic model governance and user model preference are disabled
   - PowerShell should read Chinese files with `Get-Content -Encoding UTF8`
5. Report with the repo convention: cannot do, can do, changed, verified, blocked.
6. If the completed work changes any stable rule, scope boundary, current status, blocker, or next step that is described in `任务.md` / `进度.md` / `docs/安全基线.md`, update the affected document before finishing.

## Constraints

- Treat `docs/安全基线.md` as the non-regression source for security behavior.
- Treat `任务.md` as stable rules, boundaries, and priorities.
- Treat `进度.md` as current state, verified results, blockers, and next steps.
- Use code to verify actual implementation; if it conflicts with higher-priority intent, call out the mismatch before changing code.
- When the user’s requirement is based on these markdown documents and the implementation changes that basis, update the affected markdown documents as part of the same task closeout.
- Do not reintroduce old model CRUD, runtime model switching, or per-user model preference unless the user explicitly asks.
- Do not add dashboard analytics cards or charts that rely on unrecorded fields; if the data source is missing, document the gap and keep the overview simple.
- Do not invent model configuration, runtime success, or verification results.
