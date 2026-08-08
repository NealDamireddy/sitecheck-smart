# SMARTS reconnaissance gaps

Updated 2026-08-07.

## Ad Hoc creation prerequisite

The portal has been mapped through the 2026-2027 permit list and the blocked
new-report state. A confirmed click on **Start New Report** created nothing;
SMARTS requires **Create Annual Report** first and states that this will create
the Annual Report and the Ad Hoc Report. Annual Reports are out of scope, so the
bot and reconnaissance workflow must not click that control.

To continue live Ad Hoc reconnaissance, use a reporting period with an existing
Annual Report or a pre-existing Ad Hoc draft that the user has explicitly
designated for testing. Any new Ad Hoc draft still requires action-time
confirmation and must be logged for cleanup.

The 2025-2026 period is not an alternative: SMARTS reports that its Annual
Report is already submitted and refuses new Ad Hoc reports. All new inspector
events in the current implementation target 2026-2027 based on their event
dates. Live form reconnaissance remains paused until the human-managed
2026-2027 prerequisite or a designated 2026-2027 draft exists.

## Unmapped portal areas

- New-report landing state
- General Information
- Current Event Information form and validation
- Drainage Areas empty/populated/create states
- Monitoring Locations scope, empty/populated/create states
- Raw Data empty/populated/create states
- Complete pH and Turbidity option domains
- Data Summary DOM and field-level readback mapping
- Attachments form and upload behavior
- Certification landing DOM in the new test report
- Status History
- Notes

## Critical behavioral gaps

- Whether drainage areas are report-, permit-, or project-scoped
- Whether monitoring locations persist outside the report
- Whether repeat samples are allowed for one event/location
- Live confirmation of the implemented July 1 reporting-year boundary
- Detection of the missing-Annual-Report blocker and the exact user-facing halt
  message. Annual Report internals remain intentionally out of scope.
- Portal representation of ND, DNQ, less-than, and greater-than results
- Whether units are editable
- Lab-analysis requirements for MDL, RL, and attachment metadata
- Side effects of Perform Completion Check

## Database verification gap — CLOSED 2026-08-08

The active Supabase schema has now been queried directly. All 27 pre-existing
migration files were confirmed SHA-256 byte-identical to the checksums recorded
in the target project's `_migrations` table, and live table, policy, and grant
state was verified read-only before migration `028` was written.

See `SUPABASE-ADVISOR-POSTURE.md` for the resulting advisor posture.
