# SMARTS data contract

This document is the reconciliation point between inspector input, SiteCheck's
database, the SMARTS portal, and portal readback. A row remains **unverified**
until its portal behavior has been observed in authenticated reconnaissance.

| Concept | SiteCheck source | Current SMARTS evidence | Status / required decision |
|---|---|---|---|
| Project identity | `projects.name`, `projects.wdid` | Permit list and report header | Verify exact site-name and WDID normalization. Persist portal permit identity if one exists. |
| Reporting year | Derived from `smarts_events.started_at` / normalized event start date | Native select exposes `2026` and `2025` values | July 1-June 30 rule is implemented and boundary-tested. New events select `2026` / 2026-2027. Add a live option-presence guard before production rollout. |
| Annual report prerequisite | Human-managed external prerequisite | 2026-2027 Ad Hoc creation is blocked until an annual report exists | Detect the blocker and halt. SiteCheck must not create, edit, model, or submit Annual Reports in this phase. |
| Closed reporting period | Derived event year plus portal response | 2025-2026 returns `Cannot create Ad Hoc Report for already submitted Annual Report.` | Treat as terminal for that run, never retry 2025-2026, and surface a data/reporting-year error if the event was expected to be new. |
| Event type | Bot constant `Precipitation Event` | Captured Event Information DOM previously showed value `5` | Observed; reconfirm in the new draft. Do not call it `Qualifying Storm Event` in selectors or payloads. |
| Event start/end | `smarts_events.started_at`, `ended_at` | Separate date and time inputs | Verify timezone and reporting-period boundary behavior. Preserve source instant and California wall-clock rendering. |
| Precipitation | `smarts_events.precipitation_inches` | Precipitation Amount field | Verify precision, required state, and server-side validation. |
| Discharge volume | Not modeled | Not observed for Precipitation Event | Determine whether it is conditional on Non-Storm Water Discharge Event. |
| Drainage area | Free text on `monitoring_locations.drainage_area` | Portal has a Drainage Areas child-record tab | Model as an entity if report/permit scoping and portal identity are confirmed. |
| Monitoring location | `monitoring_locations` | Portal tab plus Raw Data dropdown | Verify scope, required fields, water-body field, coordinate datum, and external option value. |
| Water body | Not modeled | Required by reconnaissance brief, not yet observed | Add only after field semantics and option/value domain are captured. |
| Sample | `samples` | Raw Data sample/list row | Verify whether multiple samples per event/location are allowed before changing uniqueness constraints. |
| Sample date/time | `samples.sample_datetime` | `MM/DD/YYYY HH24:MI` field | Verify timezone conversion, DST, and event-window validation. |
| Practitioner | `samples.qsp_name` / QSP profile | Qualified SWPPP Practitioner input | Portal maxlength was previously observed as 50; app currently allows 200. Reconfirm and align. |
| Parameter | `parameter_results.parameter` | pH and Turbidity rows | Verify row order is structural and record full DOM for both rows. |
| Result | `parameter_results.result` | Numeric result input and Data Summary readback | Verify precision and blank-result behavior. |
| Qualifier | `parameter_results.qualifier` currently `=`, `ND`, `DNQ` | Previous live evidence reported `=`, `<`, `>` | Critical semantic gap. Capture all portal options and determine whether detection status requires a separate model. |
| Units | `parameter_results.units` | Data Summary shows `SU` and `NTU` | Determine whether units are fixed, hidden, or editable on Raw Data. Normalize without discarding original values. |
| Analytical method | Free text normalized by bridge | Verified option text differs by parameter | Capture current complete option value/label sets. Preserve raw input and normalized portal value. |
| MDL / RL | Nullable result metadata | Raw Data fields previously observed | Verify when required, particularly for Lab analysis and non-equality qualifiers. |
| Analyzed by | `Self` or `Lab` | Parameter-row dropdown | Verify whether each parameter may differ and whether an actual laboratory identity is required elsewhere. |
| Lab attachment | No SMARTS-specific database model | Attachments tab not yet mapped | Add stored-object metadata, portal-safe filename, type, hash, upload state, and portal attachment ID. |
| SMARTS report identity | Not persisted on event/run | Outstanding table exposes Report ID | Persist draft/report ID and use it as the primary resume key after first creation. |
| Data Summary readback | Screenshot path only | Read-only summary table | Parse and compare every supported field before success/handoff. |
| Completion check | Not automated | Certification landing page exposes button | Keep manual until side effects and legal meaning are explicitly approved. |
| Certification | Human-only | Downstream legal action | Permanent automation prohibition. Record human-entered completion metadata separately if needed. |

## Data-model rules to validate

1. `drainage_areas` should become a project/permit-scoped entity if SMARTS
   persists these records outside a single report.
2. A sample qualifier may need separate `comparison_operator` and
   `detection_status` fields instead of overloading one enum.
3. Cross-table database constraints must ensure an event, location, sample, and
   parameter result all belong to the same project.
4. The run audit must preserve an immutable normalized payload, SMARTS report
   ID, bot/selector version, and readback comparison result.
5. Original inspector uploads and normalized records must both be retained.
6. Ad Hoc report creation must detect and safely report the annual-report
   prerequisite instead of repeatedly clicking **Start New Report** or clicking
   **Create Annual Report**.
7. Reporting year is determined only from the event start date. For the active
   work, dates from 2026-07-01 through 2027-06-30 map to 2026-2027; 2025-2026 is
   closed to new Ad Hoc reports.
