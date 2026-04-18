# KMS RAG / QA Baseline

## Runtime Policy

- Chat and embedding runtime are fixed by `.env`.
- Admin model CRUD, default switching, and user model preference remain policy-disabled.
- Admin AI area keeps only `Sys Prompt` configuration and QA audit visibility.
- QA failures must stay structured and explicit; no silent answer fallback.

## Primary Endpoints

- `POST /api/v1/qa`
- `POST /api/v1/qa/stream`
- `GET /api/v1/qa` as compat/deprecated
- search endpoints under `/api/v1/search*`

## Search Baseline

- Apply permission filtering before returning results.
- Preserve repository, file type, time, and author filtering.
- Preserve search suggestions and author autocomplete.
- Search UI snippet may be short, but QA context must use chunk-level recall data instead of UI-only truncation.

## QA Retrieval Baseline

- Recall should operate at chunk level, not document-only collapse.
- If both keyword and vector paths are available, preserve permission filtering on both sides.
- Distinguish a code defect from an embedding runtime outage.
- When vector runtime is unavailable, fail or degrade explicitly; do not fake a full hybrid success path.

## QA Output Baseline

- Keep the structured response envelope.
- Keep `sources`.
- Keep `citation_status`.
- Stream path emits `meta`, `delta`, `done`, and `error`.
- Do not append fake citation tags after generation.

## Common Failure Classes

- chat model not configured
- embedding runtime unavailable
- network unreachable
- upstream auth failure
- rate limit
- timeout
- invalid upstream response shape

## Review Questions

1. Is the issue in retrieval, model invocation, or stream transport?
2. Is the failure caused by code, configuration, or environment?
3. Does the change preserve permission filtering and strict failure?
4. Does the change keep current fixed-model policy intact?
