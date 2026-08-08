# SMARTS current-state baseline

Verified 2026-08-07 before new implementation work.

## Safety boundary

- SiteCheck may prepare and auto-fill a SMARTS Ad Hoc Monitoring Report.
- The automation must not certify, attest, notify an LRP/DAR, or submit a legal signature.
- Reconnaissance stops on the Certification landing screen before **Perform Completion Check**.
- Annual Reports are out of scope. The bot must not create, edit, or submit an
  Annual Report.
- Raw authenticated DOM and screenshots live under the gitignored
  `smarts-automation/recon/` directory. Sanitized conclusions belong here.

## Code baseline

- Branch at verification: `hardening-review`.
- SMARTS automation tests: 17 files, 130 tests passing after reporting-year
  hardening.
- SMARTS automation TypeScript check: clean.
- Parent application TypeScript check: clean.
- The worktree contains unrelated inspection-report changes. SMARTS work must not
  overwrite, reformat, or otherwise absorb those changes.

## Existing automation

The live path is deterministic Playwright automation. The legacy vision action
layer remains in the tree but is not called by `runFill`.

Current implemented path:

1. Authenticate to SMARTS.
2. Navigate from the dashboard to Ad Hoc Monitoring Reports.
3. Search the outstanding table for a matching draft.
4. Halt on multiple matches, resume one match, or create a new report when no
   match exists.
5. Fill Event Information for a new report.
6. Add Raw Data samples with pH and turbidity results.
7. Capture Data Summary.
8. Open the Certification landing screen and stop.

Known limitations:

- Reporting year is derived from the event start date using SMARTS' July-June
  boundary. Events from 2026-07-01 through 2027-06-30 select `2026` / **2026 -
  2027**.
- Invalid or missing event dates halt before **Start Ad Hoc Report** is clicked.
- The observed missing-Annual-Report and already-submitted-year responses halt
  the run without retries or Annual Report actions.
- Drainage Areas and Monitoring Locations are not created or reconciled by the
  live bot.
- Data Summary is screenshotted but not parsed or compared to the source payload.
- Attachments are not uploaded.
- Only ordinary `=` numeric readings are supported by auto-sync.
- Browser tests primarily exercise mocked page objects; live selector evidence
  remains necessary.

## Live portal observations

The following was observed in an already-authenticated SMARTS browser session.
No report or child record was created during these captures.

### Dashboard

- The browser URL can remain on `SwSmartsLogin.xhtml` while the authenticated
  dashboard is rendered.
- The account banner and complete main navigation are present.
- **File Reports** appears in both the menubar and page body; the menubar item is
  the unambiguous navigation target.

### Ad Hoc report list

- **Start Ad Hoc Report** is a button with observed id
  `noiReadyForm:j_idt75`; this is an auto-generated JSF id and must not be the
  primary long-term selector.
- **View Submitted Ad Hoc Reports** has observed stable id
  `noiReadyForm:viewSubmiitedAdhocReportsLink` (portal spelling preserved).
- The outstanding-reports table includes columns for Report ID, permit type,
  owner/operator, facility/site, status, required state, reporting period,
  event type, sample date, and deletion.
- Pagination controls exist even at low row counts. Page-size options observed:
  10, 20, 30, and 40.

### Reporting year

- Hidden/native select id and name:
  `noiReadyForm:selectedReportingYearId_input`.
- Observed options on 2026-08-07:
  - `0` — Select Reporting Year
  - `2026` — 2026 - 2027
  - `2025` — 2025 - 2026
- Selecting `2026` injects/shows `noiReadyForm:newAdhocPanel` without creating a
  report.
- The bot must derive the required reporting year from the event/reporting
  contract and verify that the derived option is present. It must not use a
  permanent hardcoded year.

### Permit list

- The current account exposes one eligible permit row for 2026-2027.
- **Start New Report** is a row action. The observed id contains a JSF row slot:
  `noiReadyForm:j_idt165:0:j_idt168`.
- The `:0:` segment is a data-row index. The `j_idt` segments are generated and
  should be treated as volatile.
- Production selection should locate the row by exact normalized WDID and then
  find the row-scoped **Start New Report** action.

### Annual-report prerequisite

- A confirmed click on **Start New Report** for the 2026-2027 permit did not
  create an Ad Hoc report and did not navigate to Event Information.
- SMARTS displayed: **No annual report found. Click on Create Annual Report
  button to create Annual Report and the Ad Hoc Report.**
- The prerequisite action is a visible **Create Annual Report** button. Its
  observed id is `noiReadyForm:j_idt76`, which is generated and therefore not a
  suitable durable selector.
- The blocked state retains the permit row and **Start New Report** link.
- After cancelling back to the Ad Hoc outstanding list, the authoritative table
  contained only the empty-state row `No records found.` Therefore no test draft
  or other report was created by the attempted action.
- Annual Report creation is out of scope for this product phase. When SMARTS
  reports that no annual report exists, the Ad Hoc workflow must halt with a
  prerequisite message and must not click **Create Annual Report**.
- Live Ad Hoc reconnaissance must therefore use a reporting period that already
  has the required Annual Report, or a pre-existing Ad Hoc draft explicitly
  designated for testing.

### Closed 2025-2026 reporting year

- A confirmed attempt to start an Ad Hoc report for 2025-2026 did not create a
  report.
- SMARTS displayed: **Cannot create Ad Hoc Report for already submitted Annual
  Report.**
- The 2025-2026 reporting year is closed and must not be retried for new reports.
- New inspector events are in reporting year **2026-2027**. The bot must select
  this from the event date, not from the current date or a fixed configuration.

## Captured raw artifacts

Authenticated, gitignored artifacts currently exist for:

- `01-home`
- `02-reports-menu`
- `03-adhoc-list`
- `03b-reporting-year-form`
- `04-adhoc-list-after-year-select`
- `04c-start-new-report-blocked`
- `04d-start-new-report-submitted-annual-blocked`

Each captured screen contains rendered HTML, a full-page screenshot,
`elements.json`, and `meta.json`.
