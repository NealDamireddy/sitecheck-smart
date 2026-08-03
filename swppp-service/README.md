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
`swppp_documents` and `bmp_checkpoint_drafts` with their RLS policies. **It is
unapplied pending review.**

## Run

```bash
.venv/bin/uvicorn app.main:app --reload --port 8000
```

## Test

```bash
.venv/bin/python -m pytest tests/ -q
```

35 tests, no network and no API keys required. They cover the properties that
must not regress:

- every data route refuses an unauthenticated request (behavioral, via
  `TestClient` — not just "the dependency is declared")
- every route taking `{project_id}` proves access through Postgres
- no module references a service-role key
- the model pin matches `src/lib/ai-model.ts`, and no retired ID is pinned
- `bmp_category` matches the `checkpoints.bmp_type` CHECK constraint in
  migration 001 (DRF-01 drift guard)
- oversized and unknown fields in model output are rejected (SEC-07)
- strict tool schema hardens nested `$defs`, not just the top level

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
- No integration test against live Supabase + Qdrant yet; the suite is unit
  and structural. The RLS policies in migration 016 are unproven until it runs
  against a real database, exactly as TST-02 was for the web app.
