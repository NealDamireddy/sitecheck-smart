# 2022 CGP Rule Matrix

Status: draft engineering contract; not approved for production compliance decisions.

Rule version: `2022-0057-DWQ/sitecheck-rules-v1-draft`

The initial pilot scope is Traditional Construction, Risk Levels 2 and 3, for active projects. The schema and domain types may represent other project types, but those combinations must return `review-required` until separately validated.

## Forecast and QPE rules

| Rule ID | Applicability | Input | Decision | Evidence | Source | Review |
| --- | --- | --- | --- | --- | --- | --- |
| QPE-INITIAL-01 | All candidate projects | NWS 24-hour forecast period | QPE begins when PoP is at least 50% and QPF is at least 0.50 inches | Immutable NWS forecast snapshot and evaluated period | CGP-FAQ; QPE-GUIDE | Pending QSP |
| QPE-EXTEND-01 | Existing forecast QPE | Next consecutive 24-hour forecast period | Event continues when QPF is at least 0.25 inches; PoP is not used for extension | Immutable NWS forecast snapshot and period | CGP-FAQ; QPE-GUIDE | Pending QSP |
| QPE-UNKNOWN-01 | All | Required PoP/QPF data missing or malformed | Return `unknown`; do not infer that no QPE exists | Retrieval error or malformed input retained | Product safety rule | Pending QSP |
| QPE-GAUGE-01 | Post-QPE determination | On-site rain gauge total for the QPE | Gauge total is used for post-QPE applicability; it does not define the forecast QPE | Gauge value, time, observer, and event link | CGP-FAQ; QPE-GUIDE | Pending QSP |

## Inspection rules

| Rule ID | Inspection kind | Preliminary timing | Required evidence | Source | Review |
| --- | --- | --- | --- | --- | --- |
| INSP-WEEKLY-01 | Weekly | At least once weekly for active covered projects | Inspector, timestamps, retained forecast, checklist, findings | CGP-FAQ; ATT-D; ATT-E | Pending QSP |
| INSP-MONTHLY-QSP-01 | Monthly QSP | Once per calendar month where applicable | QSP identity, timestamps, retained forecast, checklist | CGP-FAQ; ATT-D; ATT-E | Pending QSP |
| INSP-PRE-01 | Pre-QPE | Within 72 hours before the forecast QPE; up to 120 hours when qualifying extended forecast data is available | Triggering forecast snapshot and completed checklist | CGP-FAQ; QPE-GUIDE | Pending QSP |
| INSP-DURING-01 | During-QPE | At least once in every 24-hour QPE period | Event period, inspector, observations, discharge status | CGP-FAQ; QPE-GUIDE | Pending QSP |
| INSP-POST-01 | Post-QPE | Within 96 hours when applicable and the on-site gauge total is at least 0.50 inches | Event end basis, gauge evidence, completed checklist | CGP-FAQ; QPE-GUIDE; ATT-D; ATT-E | Pending QSP |

## Required implementation behavior

- Use exact instants internally and retain the project's IANA timezone for display and calendar rules.
- Never calculate compliance from a current-weather cache or a third-party forecast fallback.
- Never default a checklist answer to `Yes`.
- A rule decision records `ruleVersion`, reason codes, and the evidence IDs used.
- Unsupported project/risk combinations return `review-required` and cannot silently schedule or close requirements.
- Legacy `routine`, `pre-storm`, `qpe`, and `post-storm` records remain readable but are not automatically treated as V2-validated records.

## Current implementation status

- `src/lib/cgp/2022/qpe.ts` evaluates normalized forecast periods without side effects.
- `src/lib/cgp/2022/inspection-requirements.ts` creates draft requirement proposals for the pilot profile without database writes or notifications.
- `src/lib/cgp/2022/nws-forecast.ts` normalizes explicit NWS six-hour QPF periods and builds 24-hour sequences using the Water Boards Weather Table method.
- Migration `017_cgp_forecast_evidence.sql` defines append-only snapshot and normalized-interval evidence tables; it has not been applied to a production database.
- Linear projects and Traditional Risk Level 1 return `review-required`.
- Post-QPE requirements remain `pending-evidence` until both the event end and on-site gauge evidence are available.
- These modules must remain disconnected from production scheduling until the approval table below is complete.

## Approval

| Role | Name | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| Practicing California QSP | Neal Damireddy (identifier not provided) | 2026-08-03 | Approved | Confirmed QPE end, inspection windows, role distinctions, overlapping-inspection allowance, and the Risk Type 1 Linear post-QPE exception. |
| Product owner |  |  | Pending |  |
| Engineering |  |  | Drafted | Initial implementation must remain disconnected from production scheduling. |
