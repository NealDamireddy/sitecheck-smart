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
| ACC-01 | HIGH | `src/app/login/page.tsx` (absence), repo-wide | No password-reset flow anywhere, and no in-app password change — a QSP who forgot their password was permanently locked out of their own compliance records. | **fixed** `f0f23d2` — `/auth/forgot-password` + `/auth/reset-password` + Account-page change card; shared rules in `src/lib/auth/password-policy.ts`. Test: `tests/password-policy.test.ts`. |
| ACC-02 | MED-HIGH | `api/reports/generate`, `api/inspections/[id]/pdf` | Practitioner block read the per-project `qsp_*` snapshot, so a license-number correction on the Account page never reached existing projects' reports. | **fixed** `938d0df` — `src/lib/qsp-identity.ts` resolves profile-over-project per field at generation time. Test: `tests/qsp-identity.test.ts`. |
| ACC-03 | MEDIUM | `org_memberships`; no role checks | No invite/join flow; a two-QSP firm can't share a site. Roles stored but never enforced (`viewer` can delete projects). | **deferred** — see FOLLOW_UP (pending a real second-seat customer). |
| ACC-04 | MEDIUM | absence | No account deletion or data export (CA privacy exposure). | **deferred** — see FOLLOW_UP. |
| ACC-05 | LOW | `src/app/signup/page.tsx` | No resend-confirmation. (Not distinguishing "already registered" is deliberate — enumeration oracle.) | **deferred** — see FOLLOW_UP. |
| ACC-06 | LOW | `src/app/projects/new/page.tsx` | SMARTS monitoring-locations step blocks first project creation. | **deferred** — see FOLLOW_UP. |

**Held up under audit:** signup → org auto-provisioning trigger (migration 012) incl. email-confirmation timing; `/auth/callback` code exchange and its `redirect` param; session refresh consistency across middleware, server components and route handlers; logout; middleware page coverage (no gaps beyond the already-fixed demo cookie).

## Stage 3 — Compliance correctness

| ID | Sev | Location | Finding | Status |
|---|---|---|---|---|
| CMP-01 | MEDIUM | weather stack | Three parallel weather engines (OWM, NOAA, legacy detector), two sources of truth for "did it rain". | **fixed** `0248f45` — one source: NOAA. weather-api.ts rewritten in place (same shapes); OpenWeatherMap deleted. `OPENWEATHERMAP_API_KEY` env var now unused — remove from .env.local at leisure. |
| CMP-02 | HIGH | QPE pipeline | User-reported: no QPE notifications, weather inconsistent per location. Root causes found: (a) the "rain event detector" read the OWM FORECAST as history — it could never see rain that fell; (b) no 48h-separation rule existed anywhere; (c) wind double-conversion (~2.2x); (d) UTC day bucketing split CA evening storms; (e) silent Fresno fallback served the wrong site's weather; (f) the only notification writer was a daily Vercel cron that never runs in local dev. | **fixed** `dd850cd` + `0248f45` — observed-rainfall QPE engine on NOAA station data (src/lib/qpe/), correct ≥0.5"/≥48h rules with boundary tests, post-storm deadline from rain END per risk level, detection runs on dashboard mount (no cron dependency). Residual: notifications are in-app only — there is no email capability in the codebase (Resend absent); see FOLLOW_UP. |
| CMP-03 | MEDIUM | validations/monitoring-location.ts | Location name cap was 200; SMARTS rejects >25 chars at filing time. | **fixed** — 25-char cap at entry. |
| CMP-04 | — | src/lib/smarts/nal-thresholds.ts | NAL boundaries audited: `<6.0 / >9.0 / >250` — exact values compliant, matching the permit. | **verified correct** — boundary battery added (pH 5.9-9.1, turbidity 249-251), values re-exported from the constants module. |
| CMP-05 | HIGH | vision executor | No certification guard on model-generated actions — a hallucinated click at the Certify button's coordinates had nothing stopping it. | **fixed** `5c97ff8` — element-under-point probe halts click/type/select on certify/attest/penalty-of-law controls before any mouse event; covered by certification-guard.test.ts (the mandate's non-negotiable test). |
| CMP-06 | MEDIUM | deficiencies route | 72h repair deadline was pure client input. | **fixed** `c78a8aa` — server starts the clock at detection; client may only tighten. Clock is stored, surfaced (CountdownTimer with overdue state on the deficiency panel). Residual: no cross-project "overdue repairs" dashboard view — FOLLOW_UP. |
| DRF-03 | HIGH | web validation layer | ND/DNQ cross-field rules unenforced in the web app. | **fixed** `cf0b188` — shared refinement on both the standalone and sample-embedded schemas, full combination battery. Residual: the partial-update schema can't cross-validate without the existing row — FOLLOW_UP. |
| DRF-02 | HIGH | inspection type model | Types are `routine/pre-storm/post-storm/qpe`; CGP's four are Weekly/Pre-Storm/During/Post-Storm. The Part I–VII required-parts mapping cannot be expressed, let alone enforced. | **open — needs a decision.** Renaming/extending the enum touches a DB CHECK constraint (gated migration), every validation, and the report generator. Proposal drafted for Neal/Aryav; do not bolt Part IV/V/VI onto the wrong type model first. |
| CMP-07 | MEDIUM | report generator | Part I–VII fidelity: Part 1, deficiency (III), certification and signature sections exist; Parts IV/V/VI (pre/during/post-storm additional observations) have no dedicated sections — blocked on DRF-02's type model. | **open** — same decision as DRF-02; golden-file fidelity test lands in Stage 5. |

**Verified in the existing smarts-automation suite (126 tests green):** unit normalization (SU/NTU), analytical-method normalization to exact SMARTS option text, qualifier normalization, ND/DNQ rules at the bot layer, monitoring-record schema, datetime splitting.

## Stage 5 — Testing

Suite: `npm test` (268) · `npm run test:security` (131) · smarts-automation (126) · `npm run test:e2e` (18, gated).
Honest coverage report: **docs/TEST_COVERAGE.md** — read that rather than assuming a green suite means proven.

New findings, all surfaced BY the tests:

| ID | Sev | Location | Finding | Status |
|---|---|---|---|---|
| SEC-13 | MEDIUM | `api/permits/route.ts` PATCH | Request validated before authentication — unauthenticated callers got 400, not 401, and could distinguish malformed from unauthorized. | **fixed** — auth is now the first gate. Covered by the unauth matrix. |
| SEC-14 | MEDIUM | `samples/[id]`, `monitoring-locations/[id]`, `smarts-events/[id]` DELETE | Bare `delete().eq()` answered `{success:true}` even when it affected zero rows (what RLS does for a foreign row) — a QSP could be told a deletion happened that never did. | **fixed** — visibility check first, 404 when the row isn't the caller's. |
| SEC-15 | MEDIUM | `lib/validations/analyze.ts` | Every field optional: an empty body reached the Claude prompt as `undefined`, and `status` accepted any string despite being echoed back as the compliance status. | **fixed** — required fields, length caps, status constrained to the real enum. |
| TST-01 | HIGH | repo | Web app had zero tests. | **closed** — 268 tests; route manifest makes new routes fail until classified. |
| TST-02 | HIGH | live DB | RLS enforcement itself is proven only by the gated E2E isolation spec, which has never been run. | **CLOSED** — executed and passing; see the live-verification section. |
| TST-03 | MEDIUM | `smarts-automation/recon/` | The mandate's replay tests were not built: they would depend on captures of a real logged-in SMARTS session (SEC-12). | **deferred** — sanitize the fixtures first; see FOLLOW_UP. |

## Stage 4 — Field UX (partial: mechanical fixes done, design work deferred)

| ID | Sev | Location | Finding | Status |
|---|---|---|---|---|
| UX-01 | HIGH | `checkpoint-detail.tsx`, `checkpoint-photo-viewer.tsx` | The three status actions and the photo button rendered ~28px tall (`px-2.5 py-1.5 text-xs`) — under the 44px finger minimum, on the controls tapped most often, with gloves. | **fixed** — `lib/field-ui.ts` constants + `tests/field-ui.test.ts` regression guard. |
| UX-02 | HIGH | `checkpoint-photo-viewer.tsx` | No client-side compression: a 3–12 MB phone photo could exceed the route's 5 MiB cap and be rejected after the inspector walked to the BMP; uploads were slow on field cellular. | **fixed** — downscale to 2048px with fallback-to-original; "Preparing…" state and a size note so the pause reads as progress. EXIF/GPS dropped deliberately (rationale in `lib/image-compress.ts`). |
| UX-03 | MEDIUM | `ai-analysis-panel.tsx` | AI output presented without draft framing; low confidence not visually distinct. **Not** the §1.2 CRITICAL case — verified AI text never reaches the generated report, and the compliance status is only ever set by the QSP's own Mark buttons. | **fixed (framing)** — draft banner, low-confidence (<75) treatment. Making the narrative *editable* is design work — deferred. |
| UX-04 | MEDIUM | `sidebar.tsx`, `app/sites/page.tsx` | Nav said "Sites" while routes, tables and types all say project. | **fixed** — unified on "Projects". (Route `/sites` left in place; renaming it is a Stage 7 cleanup.) |
| UX-06 | MEDIUM | `account/page.tsx` | Removing SMARTS credentials — unrecoverable, since the password is never displayed again — had no confirmation. | **fixed** — explicit confirm naming the consequence. |
| UX-05 | HIGH | walkthrough | **No offline handling.** A failed request mid-walkthrough surfaces an error but there is no retry, no queue, and no persistent "not saved" indicator. Status changes write straight to the API; on one bar of signal an inspector can believe a BMP was recorded when it was not. | **open — needs design.** The core question (local draft + sync queue vs. optimistic writes with a reconciliation banner) shapes the data model. Deferred to a Fable design pass; `e2e/golden-path.spec.ts` already contains the failing-case assertion. |
| UX-07 | MEDIUM | walkthrough | Progress count (`reviewedCount/total`) is persisted to localStorage and survives refresh, but there is no guided next/back between checkpoints — the QSP navigates via the grid and back button each time. | **open — needs design.** |
| UX-08 | LOW | `/checkpoints` | Top-level checkpoint list is project-scoped only via the store's current project; deep-linking a checkpoint from another project shows "not found" rather than switching context. | **open** — Stage 7. |

**Verified sound:** `capture="environment"` opens the rear camera directly; sample entry uses `type="number" inputMode="decimal"` (correct mobile keypad); confidence is surfaced numerically with a color-coded bar; checkpoint detail has real loading, error and not-found states; the demo-data fallback correctly refuses to mask a real account's missing checkpoint.

## Stage 6 — Cloud portability

Assessment + artifacts; no migration performed. Full write-up: **docs/DEPLOYMENT.md**.

| ID | Sev | Location | Finding | Status |
|---|---|---|---|---|
| CLD-01 | — | `next.config.ts` | No `output: 'standalone'`, so the app could not be containerized without shipping node_modules. | **fixed** — standalone output; Vercel ignores it. |
| CLD-02 | MEDIUM | `src/lib/rate-limit.ts` | Rate-limit counters are per process: with N replicas the effective limit is N x the intended one. | **documented** — correct for the current single-box deploy; Redis swap noted in DEPLOYMENT and FOLLOW_UP. Interface already isolated. |
| CLD-03 | LOW | `next.config.ts` | Supabase image host would have to be hardcoded per environment. | **fixed** — derived from `NEXT_PUBLIC_SUPABASE_URL`. |
| CLD-04 | MEDIUM | app boot | **No fail-fast env validation.** A missing `SMARTS_CREDENTIALS_KEY` surfaces the first time an inspector saves credentials, not at startup. | **open** — a Zod-parsed `env.ts` is small and high-value; the first-deploy checklist covers it manually meanwhile. |
| CLD-05 | — | absent | No health endpoint; nothing for a load balancer or orchestrator to probe. | **fixed** — `/api/health` (200/503, `?shallow=1` liveness, 3s timeout, build metadata, no config disclosure). 8 tests. |
| CLD-06 | MEDIUM | 66 server files | 178 `console.*` calls: cloud aggregators cannot index free text, and console bypasses any redaction. | **fixed** — `lib/logger.ts` (JSON lines, key-based secret redaction, Errors unwrapped not spread). Security test fails the build if a route reintroduces `console.*`. |
| CLD-07 | HIGH | `lib/smarts/sync-job.ts` | Writes job state to local disk and spawns a detached child — fatal on serverless. | **documented, by design** — the bot is a separate container; deployment shape (queue-triggered task, 1 vCPU/2 GB, concurrency 1 per user, DLQ after 2) specified in DEPLOYMENT section 6. |
| CLD-08 | HIGH | migrations 008/009 | **The real lock-in.** Every RLS policy is written against Supabase's `auth.uid()`. Moving auth to Cognito/Entra ID does not degrade isolation — it removes it (policies match nothing, app goes blank). | **documented** — two re-expression options in DEPLOYMENT section 5, with a recommendation against moving enforcement into application code for a legal-record system. |
| CLD-09 | LOW | `Dockerfile` | `NEXT_PUBLIC_*` values are inlined at build time, so one image is bound to one Supabase project — staging and prod need separate builds. | **documented** — called out in the Dockerfile and DEPLOYMENT; surprises people expecting to repoint a container via env. |

**Not verified:** the container images have not been built (docker unavailable in this environment). The CI `containers` job is what will first prove them.

## Live verification (E2E against a real Supabase project)

Executed against a disposable project with all 15 migrations applied and two seeded tenants. **22/22 specs pass on Chromium and WebKit.**

| ID | Sev | Finding | Status |
|---|---|---|---|
| TST-02 | HIGH | RLS enforcement was proven only by policy review, never executed. | **CLOSED** — `e2e/isolation.spec.ts` passes against live Postgres: User B cannot open, read, list or mutate User A's project; unauthenticated and cookie-cleared sessions both redirect. Schema check confirms 32 tables, RLS enabled on every one, 103 policies, zero permissive `USING (true)`, and all three `auth.uid()` helper functions present as SECURITY DEFINER. |
| CMP-08 | HIGH | **Part 7 (Additional Corrective Actions Required) was missing from every generated report.** CGP 2022 requires it on all four inspection types, so every report the product has produced was short a required section. | **fixed** — sourced from `corrective_actions`, inserted before the certification statement, QSP-editable. Caught by the golden-path spec; the Stage 3 code audit could only suspect it. |
| UX-09 | MEDIUM | `src/stores/onboarding-store.ts` `getPersistedState()` returns a hardcoded `hasCompleted: false` and never reads localStorage — `persist()` writes a key nothing consumes. The onboarding modal therefore reappears on **every page load**, and its overlay intercepts pointer events. A field inspector dismisses a welcome tour every time they open the app. | **open — product decision.** The code comment reads deliberate ("onboarding shows every time"), plausibly for demos, so not changed unilaterally. Three-line fix if unintended. |
| ENV-03 | MEDIUM | `scripts/apply-migrations.ts` probes for migration 001 with `to_regclass('public.projects')`. Any database containing an unrelated table named `projects` is silently marked as migrated instead of failing, producing a confusing half-applied state. Cost three debugging round trips against a project holding a foreign prototype schema. | **open** — probe a distinctive column (`projects.wdid`) instead. Aryav-owned. |
| TST-04 | HIGH | The E2E suite silently skipped all 18 specs while Playwright reported the run as **passed** — Playwright does not load `.env` files, so every gate variable was undefined. A green run that asserted nothing. | **fixed** — config loads `.env.test`; `webServer` keyed on the URL rather than on that variable being unset. |
| TST-05 | MEDIUM | Signing in per spec (18 logins/run) tripped Supabase's auth rate limit; later specs failed as "stayed on /login", which looked like a WebKit auth bug. | **fixed** — `e2e/auth.setup.ts` signs in once per user and reuses `storageState`. Runtime 4.4 min → 31 s. |

## Stage 7 — Code quality, drift and dead weight

| ID | Sev | Finding | Status |
|---|---|---|---|
| DRF-01 | HIGH | `bmp_type` declared three times, all disagreeing: TS 11 values, DB CHECK 6, Zod `z.string().max(200)` — i.e. any text. Typo'd or hostile values passed validation and failed at the database; the five linear values looked valid in TS and could never persist. | **fixed** — `src/lib/cgp/bmp-types.ts` is canonical; TS derives from it, Zod validates against exactly what the DB accepts, linear values are explicitly display-only. `tests/schema-drift.test.ts` parses the migration SQL so the next divergence fails the build. |
| DRF-02 | HIGH | Inspection types (`routine/pre-storm/post-storm/qpe`) do not match CGP's four; the Part I–VII required-parts mapping cannot be enforced. | **open — still needs the Aryav decision.** Requires a CHECK-constraint migration plus changes through validations, the report generator and UI. Part 7 now generates for all types (CMP-08), so the highest-value gap is closed; the remaining work is Parts IV/V/VI keyed to a corrected type model. |
| DRF-03 | HIGH | ND/DNQ cross-field rules unenforced in web validation. | **fixed** in Stage 3. |
| QUA-01 | — | `any` / `@ts-ignore` / bare-catch audit of server and compliance code. | **verified clean** — none found. Three `as unknown as` casts remain, all legitimate type bridges (exceljs buffer, two Supabase row shapes). |
| QUA-02 | — | Expected duplication across excel-export, walkthrough and report generator. | **does not exist** — the trio already shares `SmartsExportInput` and the same `normalize` helpers. No change needed. |
| QUA-03 | LOW | 727 lines of dead code across five unreferenced modules. | **fixed** — deleted `data/linear-checkpoints.ts`, `data/report-template.ts`, `lib/inspection-transform.ts`, `lib/smarts/site-profile.ts` (stale duplicate of the bot's own), `stores/corrective-actions-store.ts` (defined, never consumed). Verified by typecheck, build, and all four suites. |
| QUA-04 | LOW | Stale TODOs. | **left in place** — all 10+ are in `src/lib/drone-provider.ts`, marking unimplemented hardware calls in the deferred drone scope. Accurate as written. |
| QUA-05 | — | Unused dependencies. | **none found** — every package in `package.json` has at least one consumer (`shadcn` via a CSS import in `globals.css`, `tw-animate-css` likewise). |

## Stage 0 — Recon findings carried forward

| ID | Sev | Location | Finding | Status |
|---|---|---|---|---|
| ENV-01 | HIGH | session | Claude Code session was opened on an empty `~/Downloads/Sitecheck-main`; real repo is `~/Documents/SiteCheck/Sitecheck-main`. | **open** (process) — reopen the session in the real repo. |
| ENV-02 | HIGH | git | Dirty tree on `feat/inspection-flow`; no review branch. | **fixed** (process) — `hardening-review` created, WIP snapshotted (`accf3f4`). |
| DRF-01 | HIGH | `src/types/checkpoint.ts` vs migration 001 vs `src/lib/validations/checkpoint.ts` | `bmpType`: TS has 11 values, DB CHECK 6, Zod accepts any string ≤200. | **fixed** — see Stage 7. |
| DRF-02 | HIGH | `src/types/drone.ts`, `validations/inspection.ts`, migration 001 | Inspection types `routine/pre-storm/post-storm/qpe` don't match CGP's four (no during-storm); Part I–VII mapping unenforceable. | **open** — Stage 3 decision. |
| DRF-03 | HIGH | `src/lib/validations/parameter-result.ts` | No ND/DNQ cross-field rule in the web app validation layer. | **fixed** — see Stage 3 table. |
| CMP-01 | MEDIUM | `src/lib/weather-api.ts` + `src/lib/smarts/noaa.ts` + legacy detector | Two parallel weather stacks + two rain-event flows = two sources of truth for QPE. | **fixed** — see Stage 3 table. |
| TST-01 | HIGH | repo root | Web app had zero tests. | **closed** — see Stage 5. |
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
| CMP-02 | HIGH | weather pipeline (`src/lib/weather-api.ts`, `src/lib/smarts/noaa.ts`, `api/weather/*`, `api/cron/pre-storm-detector`, legacy rain-event detector) | Neal reports weather is inconsistent for the project location and the app never notifies on qualifying rain events. Root causes to confirm in Stage 3: dual OWM/NOAA stacks (CMP-01), QPE rule approximation, and the cron detector's trigger/config. Decision: consolidate on NOAA api.weather.gov. | **fixed** — see Stage 3 table (CMP-02). |
