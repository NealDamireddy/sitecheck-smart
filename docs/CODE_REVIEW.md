# SiteCheck — Hardening Review Findings Ledger

Branch: `hardening-review` (forked from `feat/inspection-flow`, WIP snapshotted in `accf3f4`).
Test suite: `npm test` at repo root (Vitest, added in `20786ab`); `npm test` inside `smarts-automation/` for the bot.

Severity rubric: see the review mandate. Status is one of **fixed** (commit noted), **staged** (code landed, external step pending), **open**, **deferred** (deliberate, with reason).

## Stage 1 — Security & tenant isolation

| ID | Sev | Location | Finding | Status |
|---|---|---|---|---|
| SEC-01 | CRITICAL | `src/lib/supabase/storage.ts`, migrations 006/011 | `checkpoint-photos` and `mission-photos` buckets are public-read with guessable `{projectId}/…` paths; customer site photos world-readable. | **staged** — checkpoint-photos serving is now signed-URL based (`6b0bdfb`); **Neal must flip `checkpoint-photos` to private in the Supabase dashboard** (no code change needed at flip time). `mission-photos` (drone scope) deferred — see FOLLOW_UP. |
| SEC-02 | HIGH | `src/app/api/admin/apply-migrations/route.ts` | HTTP endpoint executes SQL migrations against the live DB behind one static header token. | **fixed** `9ea903c` — 404 in production unless `ALLOW_REMOTE_MIGRATIONS=1`. Test: `tests/apply-migrations-guard.test.ts`. |
| SEC-03 | MEDIUM | `src/middleware.ts` | Client-settable `sitecheck_demo` cookie bypassed the login wall for pages. | **fixed** `d7dbe9f` — cookie honored only outside production. Test: `tests/middleware-demo-cookie.test.ts`. |
| SEC-04 | MEDIUM | `src/lib/supabase/server.ts`, `src/lib/airspace-context.ts` | Deprecated `createServerClient()` was a service-role client behind an innocent name; airspace reads bypassed RLS via foreign `projectId`. | **fixed** `725d32f` — alias deleted; airspace fetchers take the caller's RLS-scoped client. |
| SEC-05 | HIGH | `src/app/api/smarts/sync/[jobId]/{route,screenshot/route}.ts` | No ownership check on sync-job status/screenshots; cross-tenant read gated only by UUID secrecy. | **fixed** `6bd7e63` — `job.userId` compared to caller, foreign jobs 404. Test: `tests/sync-job-ownership.test.ts`. |
| SEC-06 | HIGH | `src/app/api/samples/route.ts` | Delete-then-insert of `parameter_results` with swallowed errors: could silently destroy recorded readings and still return 201. | **fixed** `e2d936c` — update/insert first, delete stale last, loud failure. Test: `tests/replace-plan.test.ts`. |
| SEC-07 | HIGH | `analyze`, `scan-swppp`, `src/lib/ai-vision.ts` | Claude output parsed but never schema-validated before persist/return; vision path coerced bad fields to fabricated defaults. | **fixed** `fd4edd6` — `src/lib/validations/ai-output.ts` schemas, hard caps, loud 502/throw. Test: `tests/ai-output-validation.test.ts`. |
| SEC-08 | MED-HIGH | `src/lib/smarts/credentials.ts` | Server-env SMARTS credential fallback silently submitted a shared portal account for any user without saved credentials. | **fixed** `00043d9` — opt-in via `SMARTS_ALLOW_ENV_FALLBACK=1`. Test: `tests/smarts-credentials.test.ts`. |
| SEC-09 | MEDIUM | ~30 API routes | `err.message` echoed into 500 bodies (leaked env var names, Postgres error text). | **fixed** `fed2303` — generic client messages, full server logs. Deliberate exceptions: operator-facing admin/cron responses; 400s describing the user's own malformed upload. |
| SEC-10 | MEDIUM | Claude/bot routes | No rate limiting on paid or process-spawning operations. | **fixed** `6465efa` — per-user fixed-window limits: analyze 20/min, scan-swppp 5/10min, sync 3/5min. In-memory per process (single-box deploy); Redis swap noted in FOLLOW_UP. Test: `tests/rate-limit.test.ts`. |
| SEC-11 | LOW | `src/app/api/projects/[projectId]/route.ts` | WDID patch accepted without Zod (was otherwise narrow and RLS-scoped). | **fixed** `c1c0856` — `projectWdidPatch` schema. |
| SEC-12 | LOW | `smarts-automation/smarts-automation/recon/` | Live-session SMARTS HTML captures (real WDIDs) on disk; untracked but unencrypted, plus an accidental nested directory. | **open** — recommend: move to encrypted storage or scrub; keep sanitized copies for replay tests (Stage 5.6). Claude will not delete data without explicit approval. |
| RLS-01 | MEDIUM | migrations 008/009 | ~9 tables lack DELETE (some UPDATE) policies — default-deny, so silent 0-row deletes rather than leaks. | **open** — needs a migration; migrations are review-gated (Aryav). Proposed in Stage 3/7. |

## Stage 0 — Recon findings carried forward

| ID | Sev | Location | Finding | Status |
|---|---|---|---|---|
| ENV-01 | HIGH | session | Claude Code session was opened on an empty `~/Downloads/Sitecheck-main`; real repo is `~/Documents/SiteCheck/Sitecheck-main`. | **open** (process) — reopen the session in the real repo. |
| ENV-02 | HIGH | git | Dirty tree on `feat/inspection-flow`; no review branch. | **fixed** (process) — `hardening-review` created, WIP snapshotted (`accf3f4`). |
| DRF-01 | HIGH | `src/types/checkpoint.ts` vs migration 001 vs `src/lib/validations/checkpoint.ts` | `bmpType`: TS has 11 values, DB CHECK 6, Zod accepts any string ≤200. | **open** — Stage 7 (single source of truth), may need a migration. |
| DRF-02 | HIGH | `src/types/drone.ts`, `validations/inspection.ts`, migration 001 | Inspection types `routine/pre-storm/post-storm/qpe` don't match CGP's four (no during-storm); Part I–VII mapping unenforceable. | **open** — Stage 3 decision. |
| DRF-03 | HIGH | `src/lib/validations/parameter-result.ts` | No ND/DNQ cross-field rule in the web app validation layer. | **open** — Stage 3. |
| CMP-01 | MEDIUM | `src/lib/weather-api.ts` + `src/lib/smarts/noaa.ts` + legacy detector | Two parallel weather stacks + two rain-event flows = two sources of truth for QPE. | **open** — Stage 3. |
| TST-01 | HIGH | repo root | Web app had zero tests. | **in progress** — Vitest bootstrapped (`20786ab`), 45 tests and counting; full suite is Stage 5. |
| AI-01 | MEDIUM | `src/app/api/scan-swppp/route.ts` (system prompt) | Prompt instructs the model to **fabricate GPS coordinates** inside a hardcoded demo-site bounding box (36.778…, −119.41…) when the SWPPP lacks them — every real customer's extracted checkpoints land on the demo site's map location, presented as real. | **open** — Stage 3: extraction should mark positions as unlocated and let the QSP place them, not invent coordinates in a legal record. |
| AI-02 | MEDIUM | `src/app/api/checkpoints/[id]/analyze/route.ts` | On Claude failure the route falls back to `mockAnalyzeBmpPhoto` and **persists the fabricated analysis** to `ai_analyses` with no marker distinguishing it from a real one. | **open** — Stage 3/4: fail loudly, or persist with an explicit `model:'mock'` marker surfaced in the UI. |

## Non-findings (checked, held up)

- Service-role key, Anthropic key: **not** in the client bundle (byte-level grep of `.next/static` against real values; only the anon key + Mapbox token, both intended).
- No secrets tracked in git or its history; `.env.local` untracked.
- No `dangerouslySetInnerHTML`; model output never reaches SQL/HTML/shell/path sinks.
- RLS enabled on every table; org-scoping correct on parent and child tables; `smarts_credentials`/`qsp_profiles`/`smarts_runs` own-row.
- SMARTS credential encryption (AES-256-GCM, server-only key, write-only API) sound; password reaches the bot via child env only, never persisted.
- Certify hard-stop (invariant §1.2.1): no app-layer path can trigger certification; log-guard treats any claimed certified state as tamper-evidence (`sync-job.ts`). Orchestrator-level proof scheduled for Stage 3.
