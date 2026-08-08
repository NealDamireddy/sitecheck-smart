# Phase 4 data architecture

## Canonical hierarchy

SiteCheck presents inspector-originated records in this order:

```text
Company
└── Inspector
    └── Site
        ├── Weekly inspections
        ├── Monthly inspections
        └── SMARTS Ad Hoc monitoring data
```

This is a relational hierarchy, not a nested JSON document. PostgreSQL stores
the identities and relationships; private Supabase Storage holds uploaded file
bytes.

| Product level | PostgreSQL authority | Purpose |
|---|---|---|
| Company | `organizations` | Tenant and data-ownership boundary |
| Inspector | `auth.users`, `org_memberships`, `inspector_profiles` | Login, company role, and display/compliance identity |
| Inspector-to-site access | `project_inspector_assignments` | Explicitly records which inspectors work on which sites |
| Site | `projects` | Existing project/site authority, including WDID |
| Common record | `site_records` | One sortable parent for weekly, monthly, or SMARTS data |
| Weekly/monthly detail | `site_record_inspections` → `inspections` | Existing checklist, findings, deficiencies, and report snapshots |
| SMARTS detail | `smarts_report_records` → `smarts_events` | Ad Hoc report identity, reporting year, and portal readback state |

`site_records.record_type` is limited to:

- `weekly_inspection`
- `monthly_inspection`
- `smarts_ad_hoc`

Annual Reports are intentionally absent.

## SMARTS normalized values

SMARTS data remains split into discernible entities instead of one large JSON
blob:

```text
smarts_report_records
└── smarts_events
    └── samples
        └── parameter_results

projects
├── drainage_areas
└── monitoring_locations

smarts_report_records
├── smarts_payload_versions
├── smarts_attachments
└── smarts_runs
```

- `drainage_areas` and `monitoring_locations` are reusable site configuration.
- `smarts_events` stores the precipitation event.
- `samples` stores collection location and time.
- `parameter_results` stores pH and turbidity readings.
- `smarts_payload_versions` stores immutable normalized payloads attempted by
  the bot.
- `smarts_runs` stores each automation attempt and its readback result.
- Portal IDs are stored alongside the entity they identify.

## Original inputs and files

Original structured input is append-only in `site_record_sources`. Uploaded
file metadata and SHA-256 hashes are stored in `site_record_uploads`; the actual
bytes are stored in the private Supabase Storage bucket `inspection-records`.

The required object-key layout is:

```text
{org_id}/{inspector_user_id}/{project_id}/{record_type}/{site_record_id}/
  source/{safe_filename}
  attachment/{safe_filename}
  photo/{safe_filename}
```

The database stores the bucket and full object path. Public URLs are never the
authority; authorized users receive short-lived signed URLs later in the upload
pipeline.

## Data flow

1. Resolve the authenticated user's company membership and bind the record's
   inspector identity to `auth.uid()`; the client cannot choose another user.
2. Resolve or create their `inspector_profiles` row.
3. Confirm an active `project_inspector_assignments` row for the selected site.
4. Create one `site_records` parent with its exact record type.
5. Store the untouched input and file hash.
6. Validate and normalize into the appropriate detail branch.
7. For SMARTS, freeze a new `smarts_payload_versions` row before launching the
   browser worker.
8. Associate every `smarts_runs` attempt with that record and payload version.
9. Store portal readback and transition the common record to `verified` only
   after the required values match.

## Atomic creation boundary

`POST /api/site-records` is the sole application entry point for new records.
It validates the discriminated weekly, monthly, or SMARTS contract and invokes
the `create_site_record_with_detail` PostgreSQL function once.

The function:

- resolves the company from the RLS-visible site;
- requires an active, non-ended assignment for the authenticated inspector;
- serializes concurrent retries using the company and idempotency key;
- creates the common parent and exactly one detail branch in one transaction;
- derives SMARTS reporting year in California time;
- rejects reporting years before 2026-2027;
- stores the untouched structured source when supplied; and
- returns the existing matching record for a safe same-key retry.

Any failure rolls back the entire operation. Database errors are mapped to a
small public error vocabulary rather than returned to the client verbatim.

`GET /api/site-records?projectId={site}` reads the
`site_record_directory` security-invoker view. Its response is deliberately
grouped into `company`, `inspector`, `site`, record metadata, and the exact
weekly/monthly or SMARTS detail identifier. The underlying table RLS policies
remain authoritative.

## Supabase Storage authorization

Migration 023 creates the private `inspection-records` bucket and binds all six
object-path folders to the normalized `site_records` identity. Authenticated
project members may read an object; only the authenticated inspector who owns
the record may insert it. Ordinary users receive no object UPDATE or DELETE
policy, so replacements use a new path and SHA-256 metadata row.

The live database audit found a pre-existing permissive
`allow_all_storage` policy on `storage.objects`. PostgreSQL combines permissive
policies with OR, so migration 023 must remove that blanket rule before the
scoped inspection policies can protect anything. Existing photo operations use
the server-side service role and do not depend on the blanket rule.

## Integrity and lifecycle rules

- Company, site, inspector, and record type cannot change after record creation.
- An inspector must be a company member and explicitly assigned to the site.
- Inspector identity is taken from the authenticated session, not request JSON.
- Weekly/monthly parents can link only to `inspections`; SMARTS parents can link
  only to `smarts_report_records`.
- Cross-project sample, location, event, and result references are rejected for
  new rows.
- Source rows, normalized SMARTS payload versions, and status history are
  append-only to ordinary users.
- Certification remains a human action and has no automated database state.

## Live reconciliation gate

The read-only Supabase audit is recorded in
`docs/smarts-recon/PHASE-4-SUPABASE-AUDIT.md`. Migrations 021-023 remain
review-gated and unapplied. The applied migration ledger contains a checksum
drift for migration 019 that must be reconciled before Phase 4 deployment.
