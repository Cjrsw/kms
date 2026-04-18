---
name: kms-rag-search-qa
description: KMS search and QA chain skill. Use when implementing or debugging search filters, indexing, recall and ranking, search suggestions, author autocomplete, QA prompt assembly, strict failure behavior, citation handling, fixed-model runtime, or streaming QA response.
---

# KMS Search + QA Chain

Use this skill for retrieval and QA quality work.

## Steps

1. Read `references/rag-qa-baseline.md`.
2. Classify the issue domain:
   - ingestion and chunking
   - Elasticsearch indexing or filtering
   - Qdrant and embedding runtime
   - QA prompt assembly and source packing
   - chat invocation and strict failure
   - stream transport or frontend rendering
3. Trace the full chain and identify one primary failure point.
4. Decide whether the issue is a code bug, configuration gap, or environment blocker.
5. Patch with minimal scope and preserve current API shape unless the user asks otherwise.
6. Validate with compile/build checks plus targeted runtime evidence.

## Required Output

Include:

- root cause
- fixed files
- regression risk
- verification commands and results

## Constraints

- Preserve permission filtering in keyword and vector paths.
- Preserve fixed-model runtime from `.env`.
- Preserve admin AI scope as `Sys Prompt` plus QA audit only.
- Preserve strict failure behavior for model invocation errors.
- Do not force citation markers into model output text.
- Do not reintroduce model CRUD or user model preference as part of QA work.
