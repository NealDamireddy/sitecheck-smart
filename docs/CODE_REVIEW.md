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

## Stage 2 — Accounts, identity & multi-inspector model

| ID | Sev | Location | Finding | Status |
|---|---|---|---|---|
| ACC-01 | HIGH | `src/app/login/page.tsx` (absence), repo-wide | No password-reset flow anywhere, and no in-app password change — a QSP who forgot their password was permanently locked out of their own compliance records. | **fixed** `f0ad8f1` — `/auth/forgot-password` + `/auth/reset-password` + Account-page change card; shared rules in `src/lib/auth/password-policy.ts`. Test: `tests/password-policy.test.ts`. |
| ACC-02 | MED-HIGH | `api/reports/generate`, `api/inspections/[id]/pdf` | Practitioner block read the per-project `qsp_*` snapshot, so a license-number correction on the Account page never reached existing projects' reports. | **fixed** — `src/lib/qsp-identity.ts` resolves profile-over-project per field at generation time. Test: `tests/qsp-identity.test.ts`. |
| ACC-03 | MEDIUM | `org_memberships`; no role checks | No invite/join flow; a two-QSP firm can't share a site. Roles stored but never enforced (`viewer` can delete projects). | **deferred** — see FOLLOW_UP (pending a real second-seat customer). |
| ACC-04 | MEDIUM | absence | No account deletion or data export (CA privacy exposure). | **deferred** — see FOLLOW_UP. |
| ACC-05 | LOW | `src/app/signup/page.tsx` | No resend-confirmation. (Not distinguishing "already registered" is deliberate — enumeration oracle.) | **deferred** — see FOLLOW_UP. |
| ACC-06 | LOW | `src/app/projects/new/page.tsx` | SMARTS monitoring-locations step blocks first project creation. | **deferred** — see FOLLOW_UP. |

**Held up under audit:** signup → org auto-provisioning trigger (migration 012) incl. email-confirmation timing; `/auth/callback` code exchange and its `redirect` param; session refresh consistency across middleware, server components and route handlers; logout; middleware page coverage (no gaps beyond the already-fixed demo cookie).

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
| AI-01 | MEDIUM | `src/app/api/scan-swppp/route.ts` (system prompt) | Prompt instructs the model to **fabricate GPS coordinates** inside a hardcoded demo-site bounding box (36.778…, −119.41…) when the SWPPP lacks them — every real customer's extracted checkpoints land on the demo site's map location, presented as real. | **fixed** — extraction returns null coordinates; project creation rings unlocated checkpoints around the real project center for QSP placement. Test: null-coordinate case in `tests/ai-output-validation.test.ts`. |
| AI-02 | MEDIUM | `src/app/api/checkpoints/[id]/analyze/route.ts` | On Claude failure the route falls back to `mockAnalyzeBmpPhoto` and **persists the fabricated analysis** to `ai_analyses` with no marker distinguishing it from a real one. | **fixed** — real vision failures return 502 and persist nothing; keyless-demo mock stays, tagged `model:'mock-deterministic'` and echoed in the response (durable persistence of the marker needs an `ai_analyses.model` column — gated migration, see RLS-01 batch). Test: `tests/checkpoint-analyze-no-mock.test.ts`. |

## Non-findings (checked, held up)

- Service-role key, Anthropic key: **not** in the client bundle (byte-level grep of `.next/static` against real values; only the anon key + Mapbox token, both intended).
- No secrets tracked in git or its history; `.env.local` untracked.
- No `dangerouslySetInnerHTML`; model output never reaches SQL/HTML/shell/path sinks.
- RLS enabled on every table; org-scoping correct on parent and child tables; `smarts_credentials`/`qsp_profiles`/`smarts_runs` own-row.
- SMARTS credential encryption (AES-256-GCM, server-only key, write-only API) sound; password reaches the bot via child env only, never persisted.
- Certify hard-stop (invariant §1.2.1): no app-layer path can trigger certification; log-guard treats any claimed certified state as tamper-evidence (`sync-job.ts`). Orchestrator-level proof scheduled for Stage 3.

## User-reported defects

| ID | Sev | Location | Finding | Status |
|---|---|---|---|---|
| CMP-02 | HIGH | weather pipeline (`src/lib/weather-api.ts`, `src/lib/smarts/noaa.ts`, `api/weather/*`, `api/cron/pre-storm-detector`, legacy rain-event detector) | Neal reports weather is inconsistent for the project location and the app never notifies on qualifying rain events. Root causes to confirm in Stage 3: dual OWM/NOAA stacks (CMP-01), QPE rule approximation, and the cron detector's trigger/config. Decision: consolidate on NOAA api.weather.gov. | **open** — scheduled as the centerpiece of Stage 3. |
