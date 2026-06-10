# SMARTS Automation — Session Handoff

_Last updated: 2026-06-10. Read this top-to-bottom before resuming._

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
# Tests (mocked — fast). 92/92 passing across 12 files as of handoff.
cd /Users/nealdamireddy/Documents/Sitecheck-main/smarts-automation && npm test

# Typecheck (must be clean before any commit/run)
npm run typecheck     # = tsc -p tsconfig.json --noEmit

# LIVE headed run against real SMARTS (creds required; user runs this — agent has no creds)
cd /Users/nealdamireddy/Documents/Sitecheck-main/smarts-automation && \
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
  - Reporting year: `[id="noiReadyForm:selectedReportingYearId_input"]`, set value
    `"2025"` (= "2025 - 2026"; NOT "2026" = future 2026-2027), dispatch `change`
    → wait for panel `[id="noiReadyForm:newAdhocPanel"]` visible.
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
  6 = Reporting Period, 7 = Event Type) for drafts matching (siteName
  case-insensitive substring, reporting period whitespace-normalized exact,
  event type exact). **Multi-match halts loudly** (verified live against an
  account with 7 duplicate drafts for one event); zero matches falls through to
  create-new.

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
- The siteName match is a case-insensitive substring against the Facility cell
  (name + address concatenated) — could collide when one site's name is a
  substring of another's address. Consider matching the name segment only.
- `eventType` defaults to "Precipitation Event" globally — fine today, fragile
  when other event types appear.
- Verify live: after the user deletes duplicates and re-runs, does the resume
  path land where we assume (see ⚠️ above)?

**B. Split constants from variables.** `MonitoringRecord` mixes per-inspection
data (sample datetime, pH, turbidity) with per-site constants (QSP name, lab,
analytical methods, MDLs, RLs, monitoring locations, event template). The user
wants onboarding to capture constants once per WDID; per-inspection submissions
carry only measured values. Design SiteProfile + InspectionEntry → composed
`MonitoringRecord[]` for the existing `runFill` — read the existing types and
CSV schema first; match the working shape, don't replace it. The inventory of
onboarding-time SMARTS tabs is NOT confirmed complete (user mentioned drainage
areas and monitoring locations) — ask before assuming.

**C. Wire the bot into the parent Next.js app** (Sitecheck-main, App Router,
existing inspection/checkpoint/photo-analysis routes) as a backend job
triggered from the website. Unresolved architectural decisions: where SMARTS
credentials live (per-user encrypted? vault?), where Playwright runs (Vercel
Node runtime is iffy for Chromium — likely a worker service), and how the
human certification handoff surfaces in the UI. Pick a defensible direction and
explain tradeoffs; don't ask the user to pre-decide everything.

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
- _Resolved since last handoff:_ sample dates now sit inside the event window
  (05/28–05/29 within 05/27–05/29); analytical-method CSV values now match the
  live dropdown text (`E150.2`, `A4500HB`, `E180.1` — the old `EPA 150.1` /
  `SM 4500-H+B` never existed in SMARTS).

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

The module now has a **baseline commit** on `feat/inspection-flow` in the parent
repo (Sitecheck-main) — the whole `smarts-automation/` tree minus ignored
content. `node_modules/`, `artifacts/`, `*.log`, `.env*`, `recon/` (saved DOM
dumps from logged-in sessions — treat as sensitive, never commit), and the
nested `smarts-automation/` recon directory are all gitignored. Future work
should diff against that baseline; don't mix bot commits with the parent app's
unrelated modified files.

## 10. Status snapshot

- `npm run typecheck`: clean.
- `npm test`: **92/92 passing** across 12 files.
- Auto-memory also captured: `smarts-automation-progress`,
  `smarts-jsf-dropdown-technique` (load automatically in new sessions).
