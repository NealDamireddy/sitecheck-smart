# swppp-service

Layout-aware SWPPP ingestion. Converts a SWPPP PDF to Markdown with the table
structure intact, extracts BMP requirements with Claude structured outputs,
stores drafts in Postgres, and indexes the text in Qdrant for the assistant.

Third runtime in the repo, after the Next.js app and `smarts-automation/`.

## Why it's in Python

One reason only: `marker`. The web app uses `pdf-parse`, which returns a flat
character stream — a BMP schedule table comes out as run-together words with
the row/column relationship destroyed, so the model has to guess which
inspection frequency belongs to which BMP. `marker` reconstructs tables as
Markdown tables, and the extraction prompt then reads them row by row. That is
the accuracy ceiling this service exists to raise.

Everything else here could have been TypeScript. It isn't, because splitting
the pipeline across two languages would be worse than keeping it together.

## Security model

**This service never holds the service-role key.** It builds a Supabase client
with the anon key plus the *caller's* JWT, so every read and write goes through
PostgREST under the same 103 RLS policies as the web app. It does not
reimplement tenant isolation — it structurally cannot bypass it. Startup fails
if `SUPABASE_ANON_KEY` looks like a service-role key.

**Qdrant is authorized by Postgres.** A vector store has no RLS, so a filter on
a caller-supplied `project_id` would be no access control at all. Instead
`Caller.assert_project_access()` runs an RLS-scoped `SELECT` on `projects`
first; only if Postgres returns the row does the search proceed, and the result
set is re-checked against the tenant on the way out. Postgres stays the single
authority for tenant boundaries.

This is the part the original design got wrong: `GET /{site_id}/swppp-search`
had no auth dependency and filtered by the path parameter, so iterating
`site_id` returned every customer's SWPPP text.

## Layout

```
app/core/config.py       settings, fail-fast validation
app/core/auth.py         require_caller + assert_project_access  ← the boundary
app/models/schemas.py    extraction contract (enums, length caps)
app/services/pdf.py      marker → unstructured fallback
app/services/extraction.py  Claude strict tool use
app/services/vector.py   chunking, batched embeddings, Qdrant
app/services/pipeline.py orchestration + terminal status on every path
app/api/v1/swppp.py      routes
```

## Setup

```bash
cd swppp-service
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env      # fill in
```

The PDF backends are heavy (`marker` pulls torch) and are commented out of
`requirements.txt` so the test suite runs without them. Install for real use:

```bash
.venv/bin/pip install marker-pdf        # or: "unstructured[pdf]"
```

Apply `supabase/migrations/016_swppp_ingestion.sql` first — it creates
`swppp_documents` and `bmp_checkpoint_drafts` with their RLS policies.
**Applied to the throwaway test project only; unapplied everywhere else,
pending review.**

## Run locally

```bash
cd swppp-service
.venv/bin/uvicorn app.main:app --port 8000
```

Qdrant defaults to `:memory:` — no Docker, no server. `http://localhost:8000/docs`
gives interactive Swagger UI (paste a token via **Authorize**).

> **Do not use `--reload` while testing an upload.** Reload restarts the
> process on any file change, and the in-memory Qdrant index dies with it:
> the BMPs survive in Postgres but search silently returns nothing.

### Walk the upload path with curl

Verified against the seeded E2E users; substitute your own.

```bash
EMAIL=$(grep '^E2E_USER_A_EMAIL=' ../.env.test | cut -d= -f2)
PASS=$(grep '^E2E_USER_A_PASSWORD=' ../.env.test | cut -d= -f2)
PROJ=$(grep '^E2E_USER_A_PROJECT_ID=' ../.env.test | cut -d= -f2)
TOKEN=$(.venv/bin/python scripts/get_token.py "$EMAIL" "$PASS")

# 1. upload -> 202 with a document_id
curl -s -X POST "http://localhost:8000/api/v1/projects/$PROJ/swppp" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@fixtures/sample_swppp.pdf;type=application/pdf"

# 2. poll -> processing, then completed with bmp_count
DOC=<document_id from step 1>
curl -s "http://localhost:8000/api/v1/projects/$PROJ/swppp/$DOC" \
  -H "Authorization: Bearer $TOKEN"

# 3. ask a question -> grounded answer + source chunks
curl -s -G "http://localhost:8000/api/v1/projects/$PROJ/swppp/search" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "q=When must silt fence be repaired?"
```

Observed on a clean run: upload 202, `completed` with `bmp_count: 10` after
~15s, and the search answering with the document's own words —
*"Repair when accumulated sediment reaches 1/3 of fence height"*.

Omitting the `Authorization` header returns 401; using a second user's token
against this project returns 404 on read, search and upload alike.

For the whole thing in one command, without a server:

```bash
.venv/bin/python scripts/e2e_upload.py
```

## Test

```bash
.venv/bin/python -m pytest tests/ -q
```

63 tests, no network and no API keys required. They cover the properties that
must not regress:

- every data route refuses an unauthenticated request (behavioral, via
  `TestClient` — not just "the dependency is declared")
- every route taking `{project_id}` proves access through Postgres
- no module references a service-role key
- the model pin matches `src/lib/ai-model.ts`, and no retired ID is pinned
- `bmp_category` matches the `checkpoints.bmp_type` CHECK constraint in
  migration 001 (DRF-01 drift guard)
- oversized and unknown fields in model output are rejected (SEC-07)
- strict tool schema hardens nested `$defs`, not just the top level, and every
  property is `required` (a permissive schema under strict mode made it *easier*
  for the model to return nothing)
- an incomplete extraction is retried and then raised, never stored partially
- the vector store is a singleton (a per-request one gives in-memory Qdrant its
  own private database, so search silently returns nothing)

## What has actually been executed

Not inferred — run against real Supabase, real Anthropic and in-memory Qdrant
(`scripts/e2e_upload.py`, and the same path over HTTP against a live server):

| | |
|---|---|
| unauthenticated upload | 401 |
| upload → terminal status | `completed`, `bmp_count: 10`, ~15s |
| draft rows readable by owner | 10 |
| SE-10 inspection triggers | `['Weekly','Pre-Storm','Post-Storm']` — all three kept |
| search | 4 source chunks, answered with the document's own threshold text |
| user B: read / search / upload | 404 / 404 / 404 |
| user A control | 200 |

That last pair is the point: tenant isolation is proven by a real second user
being refused by real RLS policies, not by a test asserting a dependency is
declared. Migration 016's policies were unproven when written; they are not now.

## What this does NOT do

- **It does not write `checkpoints`.** Extraction produces
  `bmp_checkpoint_drafts` for QSP review. AI output is a draft, never
  authority, and a checkpoint needs a human-placed location.
- **It does not own project or site metadata.** `projects` remains the tenant
  root. `extracted_wdid` / `extracted_risk_level` record what the *document
  said*, not what the QSP has confirmed.

## Open items

- Background jobs run in-process via `BackgroundTasks`. A restart mid-run
  leaves a document at `processing` with no retry. Fine for one box; needs a
  real queue before horizontal scaling — same class as the web app's CLD-02
  in-process rate limiter.
- Qdrant in-memory is **not durable and not shared**: the index dies with the
  process and each `--workers` process gets its own. Set `QDRANT_URL` before
  this leaves a dev machine. Bounded failure — the BMPs are in Postgres, so
  losing the index costs a re-index, never compliance data.
- Proven only against `fixtures/sample_swppp.pdf`, which is clean synthetic
  output. A real SWPPP has merged cells, scanned pages and tables split across
  page breaks; that is where `pymupdf` may need replacing with `marker`.
