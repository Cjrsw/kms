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
   - dynamic model governance and user model preference are disabled
   - PowerShell should read Chinese files with `Get-Content -Encoding UTF8`
5. Report with the repo convention: cannot do, can do, changed, verified, blocked.

## Constraints

- Treat `docs/安全基线.md` as the non-regression source for security behavior.
- Treat `任务.md` as stable rules, boundaries, and priorities.
- Treat `进度.md` as current state, verified results, blockers, and next steps.
- Use code to verify actual implementation; if it conflicts with higher-priority intent, call out the mismatch before changing code.
- Do not reintroduce old model CRUD, runtime model switching, or per-user model preference unless the user explicitly asks.
- Do not invent model configuration, runtime success, or verification results.
