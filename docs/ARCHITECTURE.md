# SiteCheck — Architecture

The system as it actually is, verified against the code and a live database during the hardening review. Written to make a new engineer productive in an hour.

---

## 1. What it does

California QSPs (Qualified SWPPP Practitioners) must inspect construction sites weekly plus before, during, and after qualifying rain events, document every BMP, write a CGP-structured report, and file monitoring data into SMARTS, the State Water Board portal. That is 2–4 hours per site per week on paper. SiteCheck compresses it to roughly 20 minutes.

**This is a legal-record system.** A wrong compliance status, a lost photo, a mis-entered pH value, or one inspector seeing another's site data is a real liability event — five-figure-per-day penalties, and the QSP's personal license.

## 2. Shape

```
Next.js 16 (App Router, React 19, TS strict)      ← one deployable
├── src/app/            24 pages, 66 API routes
├── src/lib/            domain logic, validation, integrations
├── src/stores/         Zustand client state
└── supabase/migrations 15 files → 32 tables
                                                   ← process boundary
smarts-automation/      Playwright + Claude Vision bot
```

Two runtimes, deliberately. The bot drives a real browser for minutes at a time and cannot run in a serverless function; see `docs/DEPLOYMENT.md`.

## 3. Data model

32 tables. Three groups, and knowing which is which saves a lot of confusion:

**Identity** — `organizations`, `org_memberships` (role: owner/admin/qsp/inspector/viewer), `qsp_profiles`, `smarts_credentials`, `smarts_runs`. A signup trigger (`handle_new_user`, migration 012) provisions an org plus an owner membership automatically.

**QSP compliance core** — `projects` (owns everything, carries `org_id`), `checkpoints` (BMPs), `inspections`, `inspection_findings`, `deficiencies`, `corrective_actions`, `reports`, `ai_analyses`, `activity_events`, `notifications`, weather caches, `qp_events`.

**SMARTS monitoring** — `smarts_events` (rain events: forecast → active → ended → completed), `monitoring_locations`, `samples`, `parameter_results` (pH / Turbidity).

**Drone & linear (deferred, not live)** — `drone_missions`, `waypoints`, `mission_ai_analyses`, `mission_qsp_reviews`, `project_segments`, `crossings`, `segment_permits`. These share FKs with the compliance tables, so they stay inside the security blast radius even while unused. See `docs/FOLLOW_UP.md`.

Ids are `TEXT` on the core tables (application-generated, e.g. `samp-<ts>-<rand>`), UUID on the identity tables.

## 4. Authentication and authorization

Two independent layers, and you need both in your head:

**Page requests** → `src/middleware.ts` refreshes the Supabase session and redirects unauthenticated users to `/login`. Its matcher deliberately **excludes `/api`** (running route handlers through the session-refresh response drops POST bodies), so the API-auth code inside the middleware body is dead — don't rely on it.

**API requests** → every route calls `requireAuth()` (`src/lib/auth.ts`), which returns the user plus a Supabase client carrying their JWT. That client is subject to RLS. Three routes are exempt, each justified in `tests/support/route-manifest.ts`: the admin migration runner (token, 404 in production), the cron detector (bearer token), and the NOAA proxy (public, no data).

**Row-level security is the real enforcement.** Every table has RLS enabled with 103 policies total, all scoped through two `SECURITY DEFINER` helpers:

```
auth.uid() → auth_user_org_ids() → auth_user_project_ids() → project_id IN (…)
```

Child tables scope via their parent (`samples` by denormalized `project_id`; `waypoints` through `drone_missions`). **This is the load-bearing wall**: it is why a route that forgets a filter returns nothing instead of everyone's data. It also means moving off Supabase Auth doesn't degrade isolation, it removes it — see `docs/DEPLOYMENT.md` §5.

## 5. Request flows worth knowing

**SWPPP → checkpoints.** Upload PDF → `pdf-parse` extracts text server-side (never send the binary to Claude; real SWPPPs blow past the API's page limits) → Claude returns JSON → validated by `swpppExtractionOutput` → checkpoints created. Coordinates come back `null` when the document doesn't state them; the app rings unlocated checkpoints around the project center for the QSP to place. The model is forbidden from inventing positions.

**Photo → analysis.** Client downscales to 2048px (a raw phone photo exceeds the 5 MiB route cap) → uploaded to Supabase Storage → Claude Vision → validated by `bmpVisionAnalysisOutput` → persisted to `ai_analyses`. A real vision failure returns 502 and persists nothing; only a keyless demo deployment gets the deterministic mock.

**Weather → QPE.** One source: NOAA `api.weather.gov`. Forecast (`src/lib/weather-api.ts`) aggregates hourly periods on **America/Los_Angeles** days — every site is Californian, and UTC bucketing used to split evening storms. The compliance determination is separate and uses **observed** station data (`src/lib/qpe/observed.ts` → `detect.ts`): ≥0.5″ cumulative, events separated by ≥48 dry hours, pure UTC instants. Post-storm deadlines run from when rain **ended**, per risk level (48h RL1, 24h RL2/3).

**Report generation.** Assembles Parts 1, 2, 3, conditional 4, and 7, plus certification and signature. The practitioner block resolves live from `qsp_profiles` with per-field fallback to the project snapshot — a corrected license number must reach new reports. Already-generated reports are frozen in `reports.sections`, which is correct for a historical record.

**Sync to SMARTS.** Payload rebuilt server-side from the DB (never trusted from the client) → credentials decrypted server-side → bot spawned as a detached process → fills the Ad Hoc Monitoring Report → **stops at certification**.

## 6. Trust boundaries

| Boundary | Rule |
|---|---|
| Browser → API | Every route authenticates, then RLS scopes. Bodies validated with Zod before touching the DB. |
| API → Postgres | Always the caller's RLS-scoped client. `createAdminClient()` (service role) is confined to the migration runner, storage writes, and the sync-job audit writer — a test fails the build if a user-facing route imports it. |
| Uploaded documents/photos → Claude | Untrusted input. A malicious SWPPP can carry instructions; model output is therefore Zod-validated with hard length caps *after* it returns, and never reaches SQL, HTML, a file path, or a shell. |
| Claude → database | Validated, then written. Never interpolated. |
| App → SMARTS portal | Only through the bot, only with the inspector's own credentials, and never past certification. |

## 7. The human-in-the-loop gates

These are product invariants, not preferences.

1. **The bot never certifies.** Three independent guards: the orchestrator never navigates past the certification screenshot (`run-fill.ts`); the vision executor inspects the element under every model-generated click and hard-halts on certify/attest/penalty-of-law controls (`execute-action.ts`); the log parser rejects any run whose output *claims* a certified state (`sync-job.ts`). Covered by `smarts-automation/tests/certification-guard.test.ts`.
2. **AI output is a draft.** The compliance status on a checkpoint is only ever what the QSP sets with the Mark buttons. The AI panel is labeled a draft, low-confidence (<75) reads are visually distinct, and AI narrative text never reaches the generated report.
3. **Excel is a data-entry aid, not an upload.** Construction projects cannot use SPET uploads to SMARTS; all data is entered through the portal by a human.

## 8. External dependencies

| Service | Where | Notes |
|---|---|---|
| Supabase | throughout | Postgres + Auth + Storage + PostgREST. The deep coupling; see DEPLOYMENT §5. |
| Anthropic | `lib/ai-vision.ts`, `api/analyze`, `api/scan-swppp`, bot vision layer | Pinned to `claude-opus-5` in `src/lib/ai-model.ts` (the bot keeps a copy; a test fails the build if they drift). Rate-limited per user. |
| NOAA | `lib/weather-api.ts`, `lib/qpe/observed.ts`, `lib/smarts/noaa.ts` | Requires a `NOAA_USER_AGENT` with contact info. |
| Mapbox | client | `NEXT_PUBLIC_MAPBOX_TOKEN` — public by design; restrict by URL. |
| SMARTS portal | bot only | JSF/Mojarra + PrimeFaces. Selectors and vision coordinates are calibrated to a pinned Chromium. |

No email capability exists. Notifications are in-app only.

## 9. Landmines

- **`page.evaluate()` in the bot**: never pass a named function. tsx/esbuild injects a `__name` wrapper that doesn't exist in the browser → `ReferenceError`. Inline arrows only, no TS annotations in the callback body.
- **PrimeFaces dropdowns** have a hidden native `<select>` (e.g. `noiReadyForm:selectedReportingYearId_input`). Set that, don't click the widget. `waitForURL` is unreliable on JSF — assert on destination elements.
- **Claude JSON**: instruct raw JSON, parse in try/catch, halt loudly. A parse failure must never silently continue.
- **`npm run start` at the repo root intercepts** commands meant for the bot. Run bot commands from inside `smarts-automation/`.
- **`sync-job.ts` writes to local disk and spawns a child** — correct on one box, fatal on serverless.
- **The onboarding overlay re-renders on every page load** (`getPersistedState()` ignores localStorage) and intercepts pointer events. Known; see CODE_REVIEW UX-09.

## 10. Testing

`npm test` (346) · `npm run test:security` (155 of those) · `npm run test:e2e` (22, needs a seeded throwaway project) · `cd smarts-automation && npm test` (126).

Read `docs/TEST_COVERAGE.md` rather than assuming green means proven — it states explicitly what is verified, partly verified, and unverified.
