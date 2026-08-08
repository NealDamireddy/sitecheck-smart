# SiteCheck CGP Inspection Report Contract v1

## Purpose

`sitecheck-cgp-inspection-report-v1` is the only payload that Phase 5 PDF and
CSV exporters may consume. It prevents the two formats from recomputing an
inspection from live checkpoints, live deficiencies, or current project
settings.

The executable schema lives in
`src/lib/cgp/inspection-report-contract.ts`.

## Supported profile

- California CGP Order: `2022-0057-DWQ`
- Project type: Traditional/bounded site
- Risk level: 2
- Checklist template:
  `2022-0057-DWQ/traditional/risk-2/part-2-v1`
- Part 2 shape: 8 categories and exactly 22 ordered questions

Other project types and risk levels fail closed until their regulator forms
are separately verified and versioned.

## Source-of-truth rule

Exports must use the submitted inspection and its immutable
`inspection_checklist_results` rows. They must not read Part 2 answers from
the current `checkpoints` table or rebuild Part 3 from the mutable project-wide
deficiency list.

| Contract area | Stored source | PDF | CSV |
| --- | --- | --- | --- |
| Identity | Inspection ID, project ID, submission SHA-256 | Metadata/footer | Repeated on every row |
| Part 1 site | Site name, WDID, risk level snapshots | General information | Repeated on every row |
| Part 1 inspection | Observed time, type, construction stage, photos | General information | Repeated on every row |
| Weather and QPE | Inspection weather/QPE snapshots | General information | Repeated on every row |
| Site observations | Seven stored booleans and comments | General information | Repeated on every row |
| QSP | Name, title, license and company snapshots | Inspector/certification | Repeated on every row |
| Part 2 | Ordered immutable checklist-result snapshots | 22-row checklist | One row per item |
| Part 3 | Exception fields copied from Part 2 result snapshots | Deficiency table or exact empty statement | Exception columns on the matching item row |
| Certification | Stored QSP confirmation identity and time | Certification/signature block | Repeated on every row |

## Required invariants

1. The inspection is submitted and has a 64-character submission SHA-256.
2. Part 2 contains the exact 8-category, 22-question Risk Level 2 template.
3. Each `yes` row comes from `qsp-unflagged-attestation` and has no exception.
4. Each `no` row comes from `qsp-exception` and includes a description,
   recommendation, identification time and exact 72-hour repair-start deadline.
5. Part 3 exactly mirrors the `no` rows in Part 2.
6. A zero-deficiency report contains exactly
   `No exceptions taken to site BMPs.`
7. The Part 1 QSP identity matches the certification identity.
8. Missing required snapshots fail export; exporters never substitute current
   project/checkpoint values silently.

## Phase 5B materialization

`buildInspectionReportContract` in
`src/lib/cgp/inspection-report-data.ts` materializes this contract from exactly
two stored sources: the submitted `inspections` row and that inspection's
immutable `inspection_checklist_results` rows. The authenticated endpoint is
`GET /api/inspections/:id/report-data`.

Phase 5B maps these existing snapshot columns into both the contract and the
inspection API/types:

- `checklist_submission_sha256`
- `inspector_title_snapshot`
- `qsp_license_number_snapshot`
- `qsp_company_snapshot`
- `qpe_start`, `qpe_end`, `qpe_duration_hours`, `rain_gauge_inches`
- all seven `obs_*` fields and `observation_comments`
- `exemption_documentation`

The materializer has no input for current projects, checkpoints, current
weather, or mutable deficiency records, so later exporters cannot introduce a
live-data fallback accidentally.

## Phase 5C PDF rendering

Both PDF download routes consume this contract:

- `GET /api/inspections/:id/pdf` renders a submitted inspection directly.
- `GET /api/reports/:id/pdf` resolves the report to its submitted inspection;
  legacy report rows without an inspection fail closed.

The A4 PDF contains Part 1, the fixed 22-row Part 2 checklist, Part 3,
electronic QSP certification, page numbering, and the submission SHA-256.
Exception photo URLs are reproduced as immutable evidence references. The
server does not fetch arbitrary submitted URLs because doing so would allow
server-side request forgery and would not prove that the remote bytes are
immutable. General site photo attachments require a future content-addressed
inspection-photo snapshot rather than a live checkpoint-photo fallback.
