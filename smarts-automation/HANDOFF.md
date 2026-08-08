# SMARTS Automation — Session Handoff

_Last updated: 2026-06-13. Read this top-to-bottom before resuming._

> **This file is the single source of truth.** Earlier sessions (Claude Code)
> also kept auto-memory notes that loaded automatically; that does NOT carry
> over to factory.ai or any other tool. Everything you need is in this file and
> in the git history on `feat/inspection-flow`. If something here disagrees with
> a memory note you saw elsewhere, trust this file + the code.

## 1. What this is

`smarts-automation/` automates data entry into California's **SMARTS** stormwater
portal (Construction Ad Hoc Monitoring Report). SMARTS is a JSF/PrimeFaces
gov web app with **no API**.

Flow: read a CSV of monitoring data → validate (CGP) → log into SMARTS →
navigate to an Ad Hoc Monitoring Report (resuming an existing draft when one
matches, else creating new) → fill **Event Information** → fill **Raw Data**
samples (including the pH/Turbidity table) → stop at the **Certification**
screen (screenshots only).

> **HARD INVARIANT — never violate:** the bot NEVER clicks Certify, NEVER checks
> the attestation checkbox, NEVER submits. A human does the final certification.
> Always. This is non-negotiable.

Architecture: **Playwright with deterministic fills throughout the live path**
(text/role/`[id]`/`[name]` selectors). The Claude Vision layer (`src/vision/`)
was the original form-filler; it has now been **fully replaced** in the live
path — `run-fill.ts` no longer calls it. The code and its tests remain in the
tree (useful as a fallback pattern) but nothing live depends on it. It was
removed because vision hallucinated non-existent options (claimed "EPA 150.1"
against the live `A4500HB / E150.2 / pH_Field` set, and Result Qualifier "J"
against the `=/</>` domain).

## 2. How to run

**Always `cd` into `smarts-automation/` first (absolute path).** Running from the
parent `Sitecheck-main/` fails with `ERR_MODULE_NOT_FOUND` (it looks for
`Sitecheck-main/src/...`). `node_modules`, `tsx`, the CLI, and fixtures all live
under `smarts-automation/`.

```bash
# Tests (mocked — fast). 103/103 passing across 13 files as of handoff.
cd /Users/nealdamireddy/Documents/SiteCheck/Sitecheck-main/smarts-automation && npm test

# Typecheck (must be clean before any commit/run)
npm run typecheck     # = tsc -p tsconfig.json --noEmit

# LIVE headed run against real SMARTS (creds required; user runs this — agent has no creds)
cd /Users/nealdamireddy/Documents/SiteCheck/Sitecheck-main/smarts-automation && \
PLAYWRIGHT_HEADED=1 SMARTS_DUMP_FORM=1 \
SMARTS_USERNAME='you@example.com' \
SMARTS_PASSWORD='your-password' \
SMARTS_WDID="2 01C402404" \
SMARTS_SITE_NAME="Equus Ct" \
ANTHROPIC_API_KEY='sk-ant-...' \
npx tsx src/orchestrator/cli.ts ./fixtures/sample.csv 2>&1 | tee run.log
```

Env vars beyond credentials:
- `SMARTS_SITE_NAME` — Facility/Site Name as shown in the "Ad Hoc Reports -
  Outstanding" table (e.g. `Equus Ct`). **Enables the duplicate-draft guard**;
  without it every run creates a new draft (legacy behavior).
- `SMARTS_EVENT_TYPE` — Event Type column value for the guard. Defaults to
  `Precipitation Event` (the only event type the bot fills today).
- `SMARTS_DUMP_FORM=1` — **read-only** dump of every `constAdhocForm` control's
  id/name + select options to `run.log` on the first sample. Use it to recon
  fields without guessing.
- `SMARTS_CSV`, `SMARTS_WDID` — alternatives to the positional CLI args.
- Artifacts (screenshots, step traces) land in `smarts-automation/artifacts/run-<timestamp>/`.
- The agent CANNOT run live (no SMARTS creds in its env, no `.env`). The user
  runs and pastes `run.log` + screenshots.

## 3. Hard-won technical learnings (the important stuff)

1. **JSF/PrimeFaces dropdowns** = a hidden native `<select>` behind a styled
   widget. Drive them by setting `select.value` + dispatching a bubbling
   `change` event. Do NOT click the visual widget (hangs).
2. **`__name is not defined` inside `page.evaluate`**: tsx/esbuild wraps named
   functions AND named inner const-arrows with `__name(...)`, which doesn't exist
   in the browser. **Fix:** pass a *plain inline anonymous arrow*, no named inner
   helpers, no closing over module scope — pass values as the `evaluate` arg.
3. **JSF ids contain colons** (`noiReadyForm:selectedReportingYearId_input`). In a
   CSS selector use `[id="..."]` (a `#id` mis-parses the colon).
   `document.getElementById` is colon-safe.
4. **Auto-generated ids drift.** `j_idt127`, `j_idt276`, `j_idt284`, `j_idt288`
   are JSF auto-ids that change between page versions and broke us repeatedly.
   **Never hardcode them as the primary strategy.** Prefer, in order: option text
   for dropdowns (`setJsfSelectByText`), stable human-named ids for inputs
   (`…:eventStartDate_input`, `…:sampleDateTime_input`), role for buttons.
   Where no stable handle exists (QSP input, pH/Turbidity table cells) we match
   by `name` and expect to re-recon when SMARTS renumbers.
5. **Wait on destination ELEMENTS, not URLs/networkidle.** JSF navigates via
   form postbacks; URLs don't change cleanly. Wait for a specific element.
6. **"Navigating away" confirm() dialogs** are auto-accepted via
   `page.on("dialog", ...)` in `navigateToProject`.
7. **Beware duplicate text.** "Create New Sample" appears in an instruction
   sentence AND the button; a loose `getByText().first()` clicked the sentence.
   Click buttons by **role** + name.
8. **Table rows scan positionally.** The outstanding-drafts table and the
   pH/Turbidity parameter rows are addressed by row/column INDEX (stable across
   SMARTS revisions), never by their `j_idt###` column ids.
9. **Set values directly, don't type.** Date/numeric inputs carry
   `onkeydown="FormatDateTime"/"formatDigit"` handlers + datepickers that mangle
   synthetic keystrokes. Set `.value` and dispatch `input`/`change`/`blur`.
10. **Unit tests mock the page** (evaluate, setJsfSelectByText, etc.). Passing
    tests verify ORCHESTRATION WIRING, **not** that live selectors work. Real
    validation = the headed run; the user pastes `run.log` + screenshots back.

## 4. Current state — what works vs. what's left

### VERIFIED LIVE ✅
- **Login** (`src/auth/create-session.ts`).
- **Navigation** (`navigateToProject`, `navigate.ts`): dashboard → File Reports →
  Ad Hoc Monitoring Reports → [duplicate-draft check] → Start Ad Hoc Report →
  reporting year → Start New Report → Event Information form.
  - Step 4 waits for the **reporting-year `<select>` to appear** (NOT helper text,
    which only shows after a year is chosen — that was hanging step 4).
  - Reporting year: `[id="noiReadyForm:selectedReportingYearId_input"]`; derive
    its value from the event start date using the July-June reporting boundary,
    dispatch `change`, then wait for panel
    `[id="noiReadyForm:newAdhocPanel"]` visible. New events now target value
    `"2026"` / **2026 - 2027**. The closed 2025-2026 period must not be retried.
  - If SMARTS reports a missing Annual Report or an already-submitted Annual
    Report, halt. Annual Report creation and editing are out of scope.
- **Event Information** (`fillEventInformation`, `event-information.ts`):
  Event Type set to **"Precipitation Event"** via `setJsfSelectByText` (option
  value `5`), then date/time/precip, then "Save Event Information". Element ids
  (all stable, `constAdhocForm:CGPAdhocEventInfo:`): `eventStartDate_input`
  (MM/DD/YYYY), `eventStartTime` (HH:MM), `eventEndDate_input`, `eventEndTime`,
  `rainFallAmount`.
- **Raw Data sample form — fully deterministic** (`sample-form.ts` +
  `run-fill.ts` loop):
  - `openNewSampleForm` (`structural-clicks.ts`): clicks "Create New Sample" by
    **role**, waits for "Monitoring Location".
  - **Monitoring Location**: `setJsfSelectByText(record.monitoringLocationName)`
    by option text (select name is auto-gen `…:j_idt276`). Options: `1081657` =
    City DI Northeast, `1081658` = County Pipe Outfall Southeast.
  - **Sample Date & Time**: stable id `…:sampleDateTime_input`; value set
    directly (`formatForSmarts` → `MM/DD/YYYY HH:MM`) + dispatch events.
  - **Qualified SWPPP Practitioner**: by name `…:j_idt284` (auto-gen, maxlength
    50). From `record.qspName`.
  - **pH/Turbidity table** (`fillSampleTable`): rows addressed positionally
    (pH = row 0, Turbidity = row 1) under table prefix
    `constAdhocForm:CGPAdhocRawData:j_idt288`. Per row: **Result** (text, by
    name suffix `j_idt294`), **Analytical Method** (select by option text,
    suffix `j_idt298` — live options for pH: `A4500HB`, `E150.2`, `pH_Field`;
    for turbidity: `E180.1`, `A2130B`), **MDL** (`j_idt301`) and **RL**
    (`j_idt303`) when present on the record, **Analyzed By** (select, suffix
    `j_idt305`) — `"Lab"` when `labName` set, else `"Self"`. Result Qualifier is
    skipped (defaults to `=`; live domain is `=`, `<`, `>` — there is NO "J").
  - Then "Save Sample" → `waitForSampleInList` → Data Summary → Certification
    (screenshots only — see invariant).
- **Duplicate-draft guard, halt path** (`find-existing-draft.ts` + step 3.5 in
  `navigate.ts`): scans the "Ad Hoc Reports - Outstanding" table (tbody
  `noiReadyForm:adhocOutstandingTable_data`, positional columns: 3 = Facility,
  6 = Reporting Period, 7 = Event Type) for drafts matching the key.
  **Multi-match halts loudly** (verified live against an account with 7
  duplicate drafts for one event); zero matches falls through to create-new.
  Matching (hardened 2026-06-10, pure `matchOutstandingRows` is unit-tested in
  `tests/find-existing-draft.test.ts`):
  - **siteName**: EXACT equality (case-insensitive, whitespace-normalized)
    against the FIRST line of the Facility cell — the cell is
    `<name><br><address lines>`, extracted before the first `<br>` in the page
    scan. The earlier substring-vs-whole-cell match was a collision risk:
    addresses can embed site names (Equus Ct's own address is "4002 Equus Ct").
    On zero matches the guard logs every facility name it saw, so a misspelled
    `SMARTS_SITE_NAME` (which would silently create yet another duplicate) is
    diagnosable from run.log.
  - **reportingPeriod**: whitespace-normalized exact (`MM/DD/YYYY - MM/DD/YYYY`
    from the first record's event start/end).
  - **eventType**: exact after trim; defaults to `EVENT_TYPE_OPTION`
    ("Precipitation Event") exported by `event-information.ts` — the SAME
    constant the form fill selects, so guard and fill cannot diverge. Override
    per run via `SMARTS_EVENT_TYPE` if other event types ever get filled.

### BUILT BUT NOT VERIFIED LIVE ⚠️
- **Resume-into-existing-draft** (single match): clicks the draft's report-id
  link, waits for "Event Information", returns `mode: "resumed"`, and
  `runFill` **skips the Event Information fill** (SMARTS preserves saved values)
  before proceeding to Raw Data via `navigateToTab`. The post-click landing-page
  assumption comes from recon dumps, NOT a live run — the live account still has
  the duplicate drafts, so every run so far has hit the multi-match halt. First
  live test happens after the user deletes duplicates down to one.

## 5. What's next — three workstreams, in priority order

**A. Make duplicate-prevention production-ready.**
- ~~siteName substring collision~~ DONE 2026-06-10: exact match on the
  Facility cell's name line (see §4).
- ~~eventType global default fragility~~ DONE 2026-06-10: guard default now
  shares `EVENT_TYPE_OPTION` with the form fill. (True multi-event-type support
  — filling anything other than Precipitation Event — is workstream B/C scope.)
- REMAINING — live verification: after the user deletes duplicates and re-runs,
  does the resume path land where we assume (see ⚠️ above)? Ask the user to
  delete down to ONE draft for (Equus Ct, 05/27/2026 - 05/29/2026), re-run with
  `SMARTS_SITE_NAME="Equus Ct"`, and paste the `[resume]` / `[nav] step 3.5`
  lines from run.log plus any halt screenshot.

**B. Split constants from variables. — THE MAIN REMAINING WORKSTREAM.**
`MonitoringRecord` (`src/types/monitoring-record.ts`) mixes per-inspection data
(sample datetime, pH, turbidity) with per-site constants (QSP name, lab,
analytical methods, MDLs, RLs, monitoring locations, event template). The user
wants onboarding to capture constants ONCE per WDID; per-inspection submissions
carry only the measured values.
- Design `SiteProfile` + `InspectionEntry` → composed `MonitoringRecord[]` that
  the existing `runFill` consumes unchanged. **Read the existing types and the
  CSV schema (`src/csv/monitoring-record.schema.ts`) FIRST** — there is a
  working shape to match, not replace. The composed output must still satisfy
  `parseMonitoringCsv` + `validateForCgp`.
- In the parent app this maps onto tables that already exist: `projects` (WDID,
  site name), `qsp_profiles`, `monitoring_locations` (drainage area + discharge
  point already modeled), `samples`/`parameter_results`. So "the constants"
  largely live in the app DB already; the bridge (`src/lib/smarts/bot-bridge.ts`)
  is where composition happens for the app path. The CLI/CSV path is the one
  that still carries everything per-row.
- **ASK the user before assuming the onboarding inventory is complete.** They
  mentioned drainage areas and monitoring locations as onboarding-time SMARTS
  fills beyond what's automated; there may be more SMARTS tabs (the bot today
  only fills Event Information + Raw Data).

**C. Wire the bot into the parent Next.js app** — BUILT, not yet live-tested
end-to-end. Lives in the PARENT repo (`Sitecheck-main/src/...`), not in
`smarts-automation/`. Flow:

  rain-event review page (`src/app/projects/[projectId]/events/[eventId]/review`)
  → "Sync to SMARTS"
  → review-and-confirm page (`.../events/[eventId]/sync/page.tsx`) — renders the
    EXACT payload the bot will type (event window, per-location rows, methods,
    MDL/RL, analyzed-by), with hard blockers + soft warnings, and an explicit
    confirm checkbox
  → POST `/api/smarts/sync` rebuilds the payload server-side (never trusts the
    client), resolves credentials, spawns the bot via
    `src/lib/smarts/sync-job.ts` (detached `tsx` child; file-backed job store in
    `smarts-automation/artifacts/sync-jobs/`, survives dev-server reloads)
  → client polls `GET /api/smarts/sync/[jobId]`; on success shows the
    Certification screenshot + "log into SMARTS to certify" handoff.

Architectural decisions taken (with rationale, so they can be revisited):
- **Credentials = per-inspector, encrypted at rest.** Saved on the My Account
  page; AES-256-GCM with a server-only key (`SMARTS_CREDENTIALS_KEY` in the
  app's `.env.local`); stored in the `smarts_credentials` table (RLS owner-only).
  The API is WRITE-ONLY for the secret (status reads return only username +
  timestamps); decryption happens in exactly one place — resolving creds at
  sync-launch (`src/lib/smarts/credentials.ts`). `SMARTS_USERNAME`/
  `SMARTS_PASSWORD` env vars remain a server-wide fallback. Chosen over a vault
  to stay local-first; the encrypt/resolve boundary is isolated enough to swap
  for a KMS later.
- **Playwright runs on the same machine as the Next server.** Correct for the
  local-first setup. A hosted deploy (Vercel) can't run Chromium in a route
  handler — the spawn would move behind a queue to a worker box; the job-store
  shape (file/JSON per job) deliberately mirrors what a queue would persist, so
  that move is mechanical.
- **Human-certification handoff is explicit in the UI.** The confirm checkbox is
  consent to auto-FILL only; the page states the legal certification happens in
  SMARTS, by the QSP, after the bot stops. The bot never certifies (inherited
  invariant).

Key bridge file `src/lib/smarts/bot-bridge.ts` converts SmartsEvent + samples
to the bot CSV. TWO things to know:
- **Fake-UTC wall-clock encoding.** The bot's `formatForSmarts` renders with
  `getUTC*`, so the bridge encodes America/Los_Angeles wall-clock into an ISO
  string with a `Z` suffix (verified across DST + midnight). Don't "fix" this to
  real UTC — it would shift every sample time by the offset.
- **Analytical-method normalization** (`src/lib/smarts/normalize.ts`,
  `normalizeMethod`): the app stores capture-friendly labels (`pH field`,
  `Hach 2100Q`) that are NOT valid SMARTS dropdown options. Mapped to the exact
  live option text (`pH_Field`, `E180.1`, etc.; pH options: `A4500HB` `E150.2`
  `pH_Field` `pH_Paper`, turbidity: `E180.1` `A2130B`). Applied to BOTH the
  preview and the CSV so what's reviewed equals what's filled; anything still
  unmatched becomes a preview blocker, never a mid-fill halt.

Unsupported by auto-sync (blocked with a message, user files those manually):
ND/DNQ qualifiers, mixed Self/Lab within one sample.

REMAINING for C:
1. **Apply migration `supabase/migrations/014_smarts_credentials.sql` to the
   live DB.** Still not applied — the `SUPABASE_DB_URL` password rotated when
   the Supabase project was paused/restored, so it can't be run from a script
   with the current `.env.local`. User runs it in the Supabase SQL editor (the
   table + RLS policies + a `NOTIFY pgrst, 'reload schema'`), OR refreshes
   `SUPABASE_DB_URL` so a future session can apply it. Until then, saving creds
   on the account page errors with "Could not find the table
   'public.smarts_credentials'".
2. **Live end-to-end test** once the table exists and a SMARTS login is saved.

## 5.5 How to work (operating guidance — read before touching selectors)

- **The hard invariant is load-bearing.** The bot NEVER clicks Certify, NEVER
  checks the attestation checkbox, NEVER submits. A human certifies, always.
  This is non-negotiable and is asserted in comments throughout
  (`run-fill.ts` header especially). Don't relax it for convenience.
- **Green tests ≠ working live run.** `smarts-automation/tests/` mock the page;
  they verify ORCHESTRATION WIRING, not live selectors. They're invaluable for
  refactors but a passing suite says nothing about whether SMARTS's DOM still
  matches. Real validation = a headed run with the user pasting back `run.log` +
  screenshots. The agent has no SMARTS creds and CANNOT run live.
- **Halt loudly.** When something doesn't match, halt with enough context in the
  message that the next iteration knows exactly what was expected vs. seen. This
  is how earlier sessions caught real SMARTS facts the recon got wrong:
  `EPA 150.1` doesn't exist (it's `E150.2`), and the Result Qualifier domain is
  `=`/`<`/`>` with NO `"J"`. A vague halt would have hidden both.
- **Selector strategy, in order:** stable human-named id (`…:eventStartDate_input`)
  → element `name` → option text (`setJsfSelectByText`) → role (buttons). NEVER
  hardcode a `j_idt###` JSF auto-id as the primary strategy — they drift between
  page versions and have broken us repeatedly. Where only an auto-id exists (QSP
  field, table cells), match by `name` and expect to re-recon.
- **`page.evaluate` = inline anonymous arrows only.** No named functions, no
  named inner const-arrows, no closing over module scope. tsx/esbuild wraps
  named things with `__name(...)`, which is undefined in the browser and throws
  `__name is not defined`. Pass values as the `evaluate` arg.
- **Recon when unsure — ask for the specific artifact.** Not "run it again" but
  e.g. "paste the `[dump] sample form controls` JSON block from `run.log` after
  a run with `SMARTS_DUMP_FORM=1`." The user runs live; the agent does not.

## 6. Open issues / risks to watch

- **EXPECTED HALT on next live run:** the account has ~6–7 duplicate drafts for
  (Equus Ct, "05/27/2026 - 05/29/2026", Precipitation Event). The guard will
  halt with their report ids — **that's the guard working, not a bug**. The user
  deletes duplicates in SMARTS, then re-runs.
- **Auto-gen name drift:** QSP `j_idt284` and the table cell suffixes
  (`j_idt288` prefix; 294/298/301/303/305 for Result/Method/MDL/RL/AnalyzedBy)
  may renumber when SMARTS changes the form. If a fill halts with "not found",
  re-recon with `SMARTS_DUMP_FORM=1`.
- **MDL/RL** are required by SMARTS only when lab-analyzed (`labName` present).
  The fill writes them only when the record carries values; CGP validation does
  not yet enforce "lab ⇒ MDL/RL present".
- **Data Summary / Certification tabs:** screenshotted only; content never
  parsed or verified.
- **`smarts_credentials` migration not yet applied to the live DB** (see §5 C
  remaining #1). This is the top blocker for testing the app sync path.
- _Resolved this session (2026-06-13):_ analytical-method labels now normalize
  to exact SMARTS option text on BOTH the app preview and the bot CSV
  (`pH field`→`pH_Field`, `Hach 2100Q`→`E180.1`); unmatched methods are preview
  blockers, not mid-fill halts.
- _Resolved earlier:_ sample dates sit inside the event window; CSV
  analytical-method values match the live dropdown text (`E150.2`, `A4500HB`,
  `E180.1` — the old `EPA 150.1` / `SM 4500-H+B` never existed in SMARTS);
  duplicate-guard siteName/eventType matching hardened.

## 7. Key files

| File | Purpose |
|---|---|
| `src/orchestrator/cli.ts` | Live entry: env parsing → createSession → runFill |
| `src/orchestrator/run-fill.ts` | Main sequence; Raw Data loop; `buildResumeKey`; `dumpSampleFormControls` |
| `src/orchestrator/navigate.ts` | `navigateToProject` (steps 1–7 + 3.5 resume check), `navigateToTab` |
| `src/orchestrator/find-existing-draft.ts` | Outstanding-table scan for the duplicate-draft guard |
| `src/orchestrator/event-information.ts` | `fillEventInformation` |
| `src/orchestrator/sample-form.ts` | `fillSampleDetails` (date + QSP) + `fillSampleTable` (pH/Turbidity rows) |
| `src/orchestrator/structural-clicks.ts` | `clickButtonByText`, `openNewSampleForm`, `waitForSampleInList` |
| `src/util/primefaces.ts` | `setJsfSelectByText` (drive native `<select>` by option text/value/id/name) |
| `src/vision/*` | Legacy LLM form-fill layer — no longer used in the live path |
| `src/csv/*` | `parseMonitoringCsv`, `monitoring-record.schema` |
| `src/validation/*` | `cgp-validation`, `smarts-datetime` (`formatForSmarts`) |
| `src/types/monitoring-record.ts` | `MonitoringRecord` shape |
| `fixtures/sample.csv` | Test data — REAL Equus Ct locations, in-window dates, live method labels |
| `tests/*` | Vitest (mocks the page; pins orchestration + parsing) |

Parent-app files (workstream C — paths relative to `Sitecheck-main/`):

| File | Purpose |
|---|---|
| `src/lib/smarts/bot-bridge.ts` | SmartsEvent+samples → bot CSV + preview; blockers/warnings; fake-UTC + method normalization |
| `src/lib/smarts/credentials.ts` | Per-user creds: encrypt/decrypt, resolve (account→env), status (write-only secret) |
| `src/lib/smarts/sync-job.ts` | Spawns the bot as a detached child; file-backed job store; log→outcome parsing |
| `src/lib/smarts/fetch-export-input.ts` | RLS-scoped DB join → `SmartsExportInput` (shared by export + sync) |
| `src/lib/smarts/normalize.ts` | `normalizeMethod`/`normalizeUnits`/`normalizeQualifier` → exact SMARTS option text |
| `src/app/api/smarts/sync/route.ts` | POST launch (rebuilds payload, resolves creds, starts job) |
| `src/app/api/smarts/sync/preview/route.ts` | GET preview payload + credential status |
| `src/app/api/smarts/sync/[jobId]/route.ts` | GET job status (no secrets, screenshot keys not paths) |
| `src/app/api/smarts/sync/[jobId]/screenshot/route.ts` | Serves a job screenshot (path-confined to artifacts) |
| `src/app/api/smarts/credentials/route.ts` | GET status / PUT save / DELETE per-user SMARTS creds |
| `src/app/projects/[projectId]/events/[eventId]/sync/page.tsx` | Review-and-confirm UI + live job progress |
| `src/app/account/page.tsx` | QSP profile + SMARTS login card |
| `supabase/migrations/014_smarts_credentials.sql` | `smarts_credentials` table + RLS (NOT yet applied live) |

`MonitoringRecord` fields: core `monitoringLocationId, monitoringLocationName,
sampleDateTime (Date), phValue, turbidityNtu, analyticalMethod (legacy
single-method), labName, qualifierCode, dischargePoint`; optional adds
`eventStartDate, eventStartTime, eventEndDate, eventEndTime,
precipitationInches, qspName, phAnalyticalMethod, turbidityAnalyticalMethod,
mdlPh, rlPh, mdlTurbidity, rlTurbidity`. CSV columns are snake_case; optional
columns default to `undefined`. Note: `tests/parse-monitoring-csv.test.ts` pins
`sample.csv`'s exact values.

## 8. Test site & account facts (Equus Ct)

- **Site:** Equus Ct | **WDID:** `2 01C402404` | **Owner:** 1400 Foothill LLC
- **Report Period:** 2025-26 | **Risk:** Level2
- **Monitoring locations:** `City DI Northeast` (value 1081657),
  `County Pipe Outfall Southeast` (value 1081658). These are the ONLY two; the
  old fake names (North/South Outfall, East Catch Basin) do not exist in SMARTS.
- **Account:** Nilai Damireddy (neal.damireddy@emory.edu). Used as default `qspName`.

## 9. Git / commit state

Everything is committed and pushed on branch **`feat/inspection-flow`**
(remote `origin` = github.com/NealDamireddy/sitecheck-smart). Main branch is
`smarts-feature`. Relevant commits, newest first:

| Commit | What |
|---|---|
| `cdfca45` | normalize analytical methods to exact SMARTS option text |
| `d2d7203` | per-inspector SMARTS credentials, encrypted at rest (migration 014) |
| `22f7ca3` | wire Sync-to-SMARTS bot into the rain-event flow (app routes + pages) |
| `537eff0` | active-inspection tracking + table-based CGP report sections |
| `c858093` | harden duplicate-draft guard matching |
| `d2d7203`'s parents include | `cf2aa0c` baseline commit of the whole `smarts-automation/` module |

Gitignored (never commit): `node_modules/`, `artifacts/`, `*.log`, `.env*`,
`recon/` (saved DOM dumps from logged-in sessions — treat as sensitive), and
the nested `smarts-automation/` recon dir. `.env.local` (parent repo) holds
`SMARTS_USERNAME`/`SMARTS_PASSWORD` (server-wide fallback creds) and
`SMARTS_CREDENTIALS_KEY` (the AES key) — present locally, NOT in git.

## 10. Status snapshot

- Bot (`smarts-automation/`): `npm run typecheck` clean; `npm test`
  **103/103 passing** across 13 files.
- Parent app: `npx tsc -p tsconfig.json --noEmit` clean; new SMARTS files lint
  clean.
- **Moving to factory.ai:** this file is the handoff. The bot is unchanged from
  the last green state; the open work is workstream B (SiteProfile/InspectionEntry
  split) and the two REMAINING items under §5 C (apply migration 014, live e2e
  test). Start by skimming §5–§6, then the code in the §7 table.
