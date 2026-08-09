# SiteCheck — Deliberately Deferred

Findings from the hardening review that were **found and not fixed**, with the reason and the risk of leaving them. Companion to `docs/CODE_REVIEW.md` (which tracks what was fixed).

## Deferred by scope decision

**Drone & linear-infrastructure surface** — ~30 API routes (`missions/*`, `waypoints`, `telemetry`, `geofences`, `nofly-zones`, `crossings`, `permits`) and migrations 002–006. Neal's call, July 2026: secondary, does not need to be live.

- *Risk of leaving it:* these tables share FKs with the compliance product (`inspections.mission_id`, `waypoints.checkpoint_id`), so they stay inside the RLS blast radius even while unused. Their RLS policies were reviewed and are org-scoped like everything else — the deferral is about hardening effort and test coverage, not about a known hole.
- *Recommendation:* excise or quarantine in Stage 7. Excluding it from the Stage 5 isolation matrix roughly halves that stage's cost.

**`mission-photos` bucket (SEC-01, drone half)** — left public-read with guessable paths. `checkpoint-photos` (the QSP-facing bucket) was converted to signed-URL serving.

- *Risk:* drone imagery of customer sites is world-readable to anyone who learns a path. Only acceptable because the drone product isn't live.
- *Fix when needed:* mirror `resolveCheckpointPhotoUrl` for the mission bucket, then flip it private.

## Deferred pending a real second-seat customer

**ACC-03 — no invite/join flow; roles are decorative.** `organizations` and `org_memberships` exist with roles (`owner/admin/qsp/inspector/viewer`) and RLS scopes correctly by org, but nothing writes memberships except the signup trigger, and **no code path checks `role`**.

- *Consequence today:* a second QSP who signs up gets their own isolated org with no path into the first — a two-person firm cannot share a site. Within an org, a `viewer` can delete projects.
- *Why deferred:* building invites before a paying two-seat customer is speculative, and the shape (email invite vs. domain join vs. admin-adds-seat) depends on how the first firm actually buys.
- *Fix shape when needed:* invite-by-email writing `org_memberships`, plus a role gate in `requireAuth` or per-route. Roughly a day's work; no schema change required — the columns are already there.

## Deferred pending a compliance decision

**ACC-04 — no account deletion or data export.** California users, California data, no CCPA path.

- *Risk:* a deletion request today has no answer, and enterprise procurement will ask. Not currently a violation of anything you've promised — there is no privacy policy claiming otherwise — but that is itself worth fixing.
- *Fix shape:* export = zip of the user's rows plus their storage objects; deletion = org cascade (`ON DELETE CASCADE` is already in place from `auth.users` down) behind a grace period and an explicit confirmation. Document the guarantee in `docs/SECURITY.md` when built.

## Deferred as low value

**ACC-05 — no resend-confirmation on signup**, and no distinct feedback when an email is already registered (the latter is deliberate — it would be an account-enumeration oracle). Minor dead end; a "resend" button on the success screen is the whole fix.

**ACC-06 — SMARTS monitoring locations block first project creation.** A conversion leak for inspectors onboarding outside storm season. Make the wizard step skippable with a "set up before your first storm" nudge.

## Deferred because it needs a gated migration

Migrations are reviewed by Aryav before they land, so these are proposals rather than commits:

- **RLS-01** — ~9 tables lack DELETE (and some UPDATE) policies: `weather_snapshots`, `weather_forecasts`, `qp_events`, `activity_events`, `notifications`, `reports`, `ai_analyses`, `mission_ai_analyses`, `segment_permits`. Default-deny, so this is a *silent failure* class (an RLS-client delete affects 0 rows and reports success), not a leak.
- **AI-02 durable marker** — `ai_analyses` has no `model` column, so the `mock-deterministic` marker is returned in the API response but not persisted. Add `ai_analyses.model TEXT` and write it.
- **DRF-01** — `checkpoints.bmp_type` CHECK allows 6 values; the TS union has 11. Either widen the constraint or narrow the type; do not leave them disagreeing.

## Known architectural debt (Stage 7 candidates)

- **In-memory rate limiter** (`src/lib/rate-limit.ts`) is per server process. Correct for the current single-box deployment; swap the store for Redis behind the same interface if the app goes multi-instance.
- **Hand-maintained TS types parallel to Zod schemas** — `src/types/*` and `src/lib/validations/*` describe the same shapes twice, which is how DRF-01/02/03 happened. Infer from Zod where practical.
- **Model pin — RESOLVED.** Was `claude-sonnet-4-20250514`, copied into six files. The model was retired, so every AI feature returned `404 not_found_error` and the QSP saw "analysis failed — nothing was saved". Now `claude-opus-5`, declared once in `src/lib/ai-model.ts`, with `tests/model-pin.test.ts` failing the build on drift, on a reintroduced hardcode, on a 4.6+ breaking parameter, and on prompt limits crossing the Zod caps. The migration was not just the string — see that file's header for the three things that also break (assistant prefills 400, thinking-on-by-default eats `max_tokens`, sampling params 400).
- **`smarts-automation/smarts-automation/`** — an accidental nested directory holding the live-session SMARTS recon HTML (SEC-12). Untracked. Needs a decision from Neal: scrub, encrypt, or keep sanitized copies for the Stage 5.6 replay tests.

## Deferred from Stage 4 — needs a design decision, not a patch

**UX-05 — offline and flaky-network behavior in the walkthrough.** Today a status change is a direct API write; a failure shows an error but nothing retries, nothing queues, and no persistent indicator tells the inspector which observations did not reach the server. On one bar of signal a QSP can believe a BMP was recorded when it was not.

- *Why deferred:* the fix is an architecture choice, not a patch. Local-draft-plus-sync-queue (durable, needs conflict rules and a reconciliation UI) versus optimistic writes with a persistent unsynced banner (much simpler, weaker guarantee). That choice shapes the data model and the walkthrough UI together, and getting it wrong means rebuilding both.
- *Interim mitigation:* the inspection progress count already persists to localStorage, so a refresh does not reset the walkthrough. Photo uploads and status writes are the exposed paths.
- *Already written:* the failing assertion lives in `e2e/golden-path.spec.ts` ("interruption path"), so whichever design lands has a test waiting.

**UX-07 — guided walkthrough navigation.** There is a persisted progress count but no next/back between checkpoints; the inspector returns to the grid each time. A guided sequence ("7 of 32", next/skip/N-A) is the single biggest reduction in taps for the core loop, and it interacts with UX-05's persistence model — design both together.

**UX-03 (remainder) — editable AI narrative.** The draft framing landed; making the narrative editable and attributing the edit to the QSP is the other half. Needs a decision on whether edits are stored alongside the AI original (audit trail) or replace it.

## Deferred from Stage 6

**CLD-04 — no fail-fast environment validation.** Every env var is read ad hoc via `process.env`. A missing or malformed value surfaces at first use, not at boot: a bad `SMARTS_CREDENTIALS_KEY` fails when an inspector saves credentials, a missing `NOAA_USER_AGENT` when weather is first fetched. A Zod-parsed `src/lib/env.ts` that throws at module load would turn every one of these into a deploy-time failure. Small change, high value on a new environment; the first-deploy checklist in `docs/DEPLOYMENT.md` is the manual stand-in.

**CLD-02 — in-memory rate limiter.** Fine on one box, wrong on many: each replica keeps its own counters, so the effective limit multiplies by replica count. Swap the store for Redis/ElastiCache behind the existing `FixedWindowLimiter` interface before scaling the web tier past one instance.

**Container images unbuilt.** The Dockerfiles were written against the real dependency graph and reviewed, but never executed — docker was unavailable in the review environment. The CI `containers` job builds both on every PR; treat the first green run there as the actual verification.

## Dependency advisories not taken

**exceljs → archiver / glob / minimatch / brace-expansion (high).** `npm audit` offers exactly one fix: downgrade `exceljs` from 4.4 to **3.4.0**, a major downgrade that would break the SMARTS export path (`src/lib/smarts/excel-export.ts`). The advisory is a DoS via unbounded brace expansion — reachable only by feeding hostile input to the archiver, and the only workbooks this code writes are ones it generates itself from validated sample data. Accepted risk; revisit when exceljs ships a patched archiver.

**@anthropic-ai/sdk (moderate).** Fix requires a major bump. The model-pin upgrade to `claude-opus-5` is done and the installed SDK handles it, so this is now independent of that work — still a deliberate upgrade, not an audit-driven force-fix.

Re-check with `npm audit --omit=dev` — dev-only advisories are noise for a deployed image, since dev dependencies are not in the runtime layer.

## Known build warning

`next build` emits one Turbopack NFT warning: `src/lib/smarts/sync-job.ts` does dynamic `fs` work (`existsSync`/`readFileSync`/`writeFileSync` on computed paths), so the file tracer gives up and traces the whole project into `.next/standalone` — 123 MB locally, including `src/`, `tests/` and `docs/`. The build succeeds and the container image is far smaller because `.dockerignore` keeps `tests/`, `docs/`, `e2e/` and `smarts-automation/` out of the build context entirely. Adding `turbopackIgnore` comments did **not** satisfy the tracer. The real fix is the queue-worker refactor already planned for cloud deployment: moving the job store behind a queue interface removes the dynamic `fs` from this module and the warning with it.

## Next.js deprecation

`next build` warns that the `middleware` file convention is deprecated in favour of `proxy`. `src/middleware.ts` is the auth wall (SEC-03 lives there), so the rename is mechanical but security-relevant — do it deliberately, with `tests/security/middleware-demo-cookie.test.ts` green on both sides of the change.

## Deferred from Stage 7

**Widening the `bmp_type` CHECK constraint.** The five linear-infrastructure categories (`trench-plug`, `slope-breaker`, `water-bar`, `hdd-containment`, `stream-crossing-erosion`) have labels and colors but cannot be persisted — the constraint rejects them, and the write schema now rejects them too so the failure is a clear 400 rather than a database error. To enable them, review and apply:

```sql
ALTER TABLE checkpoints DROP CONSTRAINT checkpoints_bmp_type_check;
ALTER TABLE checkpoints ADD CONSTRAINT checkpoints_bmp_type_check
  CHECK (bmp_type IN (
    'erosion-control', 'sediment-control', 'tracking-control',
    'wind-erosion', 'materials-management', 'non-storm-water',
    'trench-plug', 'slope-breaker', 'water-bar',
    'hdd-containment', 'stream-crossing-erosion'
  ));
```

Then move those five values from `LINEAR_BMP_TYPES` into `DB_BMP_TYPES` in `src/lib/cgp/bmp-types.ts`; `tests/schema-drift.test.ts` will fail until you do, which is the point. Deliberately not added as a migration file — `npm run db:migrate` would apply it unreviewed, and this is only needed when the linear product goes live.

**DRF-02 remains the one substantive open item.** The inspection-type enum doesn't match CGP's four types, so the required-parts mapping (Weekly → I/II/III/VII, Pre-Storm → +IV, During → +V, Post-Storm → +VI) cannot be enforced in code. Part 7 now generates for every type, so reports are no longer missing a universally-required section; what remains is Parts IV/V/VI keyed to a corrected type model. Needs a CHECK-constraint migration plus changes through validations, the generator and the UI — a reviewed change of its own, not a drive-by.

---

## Found 2026-08-08 during the first real end-to-end run on production

The first time a genuinely new account went through signup → create site → start
inspection. Everything below was found by walking that path, not by reading code.

### Blocking — a new customer cannot record an inspection at all

**PROV-01 — nothing in the product creates an inspector profile or a project
assignment.** `create_site_record_with_detail` gates record creation on an active
`inspector_profiles` row plus an active `project_inspector_assignments` row.
Verified 2026-08-08: no INSERT to either table exists anywhere — not in `src/`,
`scripts/`, `supabase/migrations/`, or `e2e/`. Migration `021` creates both tables
and never populates them. The only working account (`neal@sitecheck.demo`) was
provisioned by hand.

- *Consequence:* a new user signs up, creates a site, presses "Start weekly visit"
  and gets "an inspector is not assigned to this site". Dead end, no way out
  through the UI.
- *Status:* being addressed in a spun-off session. Closely related to ACC-03 above
  — both are the same missing membership/role plumbing.
- *Do not* fix by relaxing the hierarchy checks in the RPC. The gate is correct;
  the provisioning is what's missing.

### Wrong data shown to the user

**GEO-01 — the project wizard fabricates Fresno coordinates.**
`src/app/projects/new/page.tsx:265` falls back to `{ lat: 36.78, lng: -119.42 }`
when there is no centerline and no prefill — the bundled demo project's centre.
A Pleasanton site created 2026-08-08 was stored with Fresno's coordinates.

- *Consequence:* NOAA is asked about the wrong place, so the dashboard shows
  another city's weather as if it were the site's. On a QPE-driven product this
  is not cosmetic — rain-event triggers key off this location.
- *Note the irony:* `src/lib/weather-api.ts` was deliberately hardened against
  exactly this ("silent Fresno fallback ... served Fresno's weather as if it were
  the site's" is listed there as a fixed defect) and now refuses to guess. The
  wizard reintroduces the guess one layer up.
- *Fix shape:* geocode the address already collected (a Mapbox token is present),
  let the user confirm the pin, and fail loudly with no location rather than
  substituting a default. A zip code alone is enough for weather but too coarse
  for the site map and drainage areas.

### Usability defects that make failures unreadable

**MON-01 — a new monitoring location starts invalid and cannot be saved.**
`addLocation()` in `src/components/projects/monitoring-locations-builder.tsx:47`
seeds `drainageArea: ''`, but `monitoringLocationCreate` requires
`min(1, 'drainageArea is required')`. Any row where the user does not notice the
field fails with a 400 at project-create time.

**MON-02 — Zod errors render as `[object Object]`.**
`src/app/api/monitoring-locations/route.ts:151` returns `{ error: err.issues }`
(an array); `src/app/projects/new/page.tsx:343` interpolates it into a template
string. The user sees `[object Object]` instead of "drainageArea is required".
This is what made MON-01 undiagnosable from the UI.

**MON-03 — a failed location leaves a duplicate project behind.** The wizard
deliberately does not roll the project back when a location POST fails
(`projects/new/page.tsx:318-321`, a documented choice). Retrying therefore creates
a second project. Two identical "Equus Ct" projects were produced this way on
2026-08-08. Either roll back, or resume into the existing project on retry.

### Platform limit, previously documented, now hit in production

**UPL-01 — SWPPP scan returns HTTP 413 above ~4.5 MB.** No size guard in
`src/app/api/scan-swppp/route.ts`; the 413 comes from Vercel's serverless
request-body cap. The UI advertises 30 MB. Already recorded in the commit
"feat(swppp): accept PDF uploads up to 30MB": Vercel's ~4.5 MB body limit and
Anthropic's ~32 MB base64 ceiling both sit below the advertised number.

- *Fix shape:* upload direct to Supabase Storage from the browser, then have the
  server read from storage. Raising a constant will not help.
- *Interim:* the UI should state the real limit instead of 30 MB.

### Unverified — seen but not diagnosed

**OBS-01 — repeated HTTP 400s on dashboard reads.** Vercel runtime logs for
2026-08-08 show 19 × 400 across `GET /api/deficiencies`, `/api/checkpoints`,
`/api/dashboard/metrics` and `/api/activity`, alongside the monitoring-location
failures. Most likely a missing/blank `projectId` query param while the store is
still resolving, but this was not traced. Worth reproducing before assuming it is
benign.

### Environment and account state

- **Production is missing `SMARTS_CREDENTIALS_KEY`, `SWPPP_SERVICE_URL`, and
  `ADMIN_MIGRATION_TOKEN`.** Saving per-inspector SMARTS logins and SWPPP
  ingestion will fail until they are set.
- **`OPENWEATHERMAP_API_KE`** (missing trailing `Y`) is set in Vercel. Harmless —
  no code reads OpenWeatherMap any more, NOAA replaced it — but it shows an entry
  that was never verified.
- **The stored `SUPABASE_DB_URL` no longer authenticates.** As of 2026-08-08 the
  value in `.env.development.local` and `.env.local` fails with "password
  authentication failed"; the database password appears to have been rotated
  during the Vercel setup. `npm run db:migrate` and the admin scripts are broken
  locally until it is updated. Check whether Vercel's copy is stale too.
- **Attachment upload/download is still unverified end to end.**
  `site_record_uploads` has 0 rows; the flow has never completed once.
- **Leaked-password protection cannot be enabled** — a Supabase Pro feature and
  the org is on free. See `docs/smarts-recon/SUPABASE-ADVISOR-POSTURE.md`.

### Latent, not currently broken

**LAY-01 — viewport breakpoints inside narrower containers.** The visit picker was
fixed with container queries (commit `c3c3984`). `checkpoint-grid.tsx`,
`telemetry-panel.tsx`, `mission-card.tsx`, `mission-scope-selector.tsx` and
`mission-deviation-panel.tsx` use `sm:`/`lg:` multi-column grids too, but all
render full-width today, so none is currently wrong. Converting them to
`@container` would be strictly more robust, but the thresholds need retuning per
component — a naive swap makes some of them switch to 4 columns *earlier* on small
screens, which is worse. Do it deliberately, not as a sweep.
