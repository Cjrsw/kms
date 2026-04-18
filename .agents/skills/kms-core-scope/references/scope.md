# KMS Scope Baseline

## Project Goal

Build an enterprise knowledge management MVP with:

- login and permission control
- repository, folder, note, and attachment management
- PDF and DOCX ingestion with controlled access
- full-text search and filtering
- permission-aware QA
- admin backend
- dockerized local integration

## Stable Module Map

### Auth and Organization

- `admin` and `employee` roles
- clearance levels `L1` to `L4`
- departments and employee lifecycle
- profile maintenance and password change

### Knowledge Content

- repository -> folder -> note -> attachment hierarchy
- note body stored as `content_json`
- retrieval and indexing use `content_text`
- attachment support is limited to `pdf` and `docx`
- online preview supports `pdf` only; `docx` should prompt then download

### Search and QA

- Elasticsearch full-text search and filtering
- permission filtering must apply before results are shown or used for QA
- fixed-model QA runtime from `.env`
- admin AI scope is limited to `Sys Prompt` and QA audit
- QA supports normal and SSE stream interfaces

### Runtime and Delivery

- frontend, backend, mysql, redis, elasticsearch, qdrant, minio, celery, embedding-service
- docker compose is the primary local integration path

## Implemented and Should Not Be Reframed As Design Work

- login, logout, current user, profile, password change
- repositories, folders, notes, attachments
- note/folder create and delete on user side
- attachment upload, replace, delete, download, PDF preview
- search filters, suggestions, author autocomplete
- strict-failure QA and streaming QA
- admin `Sys Prompt` configuration and QA audit view

## Disabled or Out Of Scope

### Disabled Current Policy

- admin model CRUD, enable/disable, default switching
- per-user chat model preference
- runtime model selection from database records

### Out of Scope for MVP

- OCR image extraction
- PPT or Excel parsing
- multi-tenant isolation
- approval workflow
- advanced observability platform

## Scope Checks

When a request arrives, answer these questions:

1. Does it fit the current KMS hierarchy and role model?
2. Does it preserve fixed-model QA policy?
3. Does it preserve the current security baseline?
4. Is it a real missing feature, or already implemented and needing verification only?
5. Is it blocked by environment/configuration rather than scope?
