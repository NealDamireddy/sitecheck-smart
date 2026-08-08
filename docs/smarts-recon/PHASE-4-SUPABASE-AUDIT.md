# Phase 4 live Supabase audit

Read-only audit performed through the Supabase MCP connection on 2026-08-07.
No schema, policy, storage, authentication, or application data was changed.

The audit was independently re-run through the project-scoped standalone
Supabase MCP (`mcp__supabase__...`) after the desktop plugin connection was
replaced. The standalone MCP resolved the same project and reproduced the
schema, ledger, policy, advisor, storage, and row-count findings below. The
earlier results were therefore not an artifact of the plugin connector.

After the MCP was restarted with the explicit project reference and
`read_only=true`, Codex independently verified that the loaded configuration
contains the expected URL and that database, advisor, documentation, and type
tools can resolve the project. `list_branches` still returns `Project reference
is missing when validating permissions`. Supabase's current MCP contract also
requires the account-level `confirm_cost` tool before `create_branch`, while
account tools are intentionally unavailable in project-scoped mode. Remote
writes therefore remain paused until a separate, feature-restricted management
MCP is authorized for branch creation.

## Project resolved

- Codebase URL: `atbpfdmzwajxxfzfqozq.supabase.co`
- Supabase project status: active and healthy
- Region: US West
- PostgreSQL: 17.6, database timezone UTC
- The separate project named `smarts` is inactive and is not referenced by
  this codebase.

## Migration state

The project uses SiteCheck's `public._migrations` ledger rather than Supabase's
managed migration history. Supabase's managed migration list is empty, while
the custom ledger records migrations 001 through 020 as applied.

Local and live SHA-256 values match for migrations 001-018 and 020. Migration
019 has drift:

- live ledger prefix: `a7ba2f05`
- current local file prefix: `e4f0bdb2`

The live `submit_inspection_checklist(text,jsonb,jsonb)` function exists, but a
previously applied migration file must not be silently rewritten. Before any
Phase 4 deployment, either restore the exact applied 019 artifact or add a new
forward-only migration that represents the intended difference and explicitly
reconcile the ledger procedure.

Migrations 021, 022, and 023 are local, review-gated, and absent from the live
database.

## Existing relational model

The live schema already supplies the foundations Phase 4 should reuse:

| Layer | Live authority | Verified state |
|---|---|---|
| Company | `organizations` | RLS enabled |
| Membership | `org_memberships` | RLS enabled; roles include owner, admin, qsp, inspector, viewer |
| Site | `projects` | RLS enabled; `org_id` foreign key present |
| Practitioner profile | `qsp_profiles` | RLS enabled; one row per auth user |
| Inspection | `inspections` and checklist/finding/deficiency children | RLS enabled |
| SMARTS event | `smarts_events` | RLS enabled; current sources are NOAA or simulated |
| Monitoring | `monitoring_locations`, `samples`, `parameter_results` | RLS enabled |
| Browser run | `smarts_runs` | RLS enabled; currently user-owned |

The Phase 4 tables do not yet exist. The live database contains three auth
users, four organization rows, one project, three inspection rows, one SMARTS
event, and two browser-run rows. No private field values were copied into this
audit.

## Integrity findings incorporated into Phase 4

- `projects.id`, `inspections.id`, `smarts_events.id`, monitoring-location IDs,
  sample IDs, and result IDs are text. Phase 4 keeps those types and uses UUIDs
  only for its new routing/audit identities.
- Existing child SMARTS tables carry a denormalized `project_id`, but their
  current foreign keys do not prevent a sample from referencing an event or
  location in another project. Migration 021 adds composite project-consistency
  foreign keys as `NOT VALID` so legacy rows can be audited before validation.
  A live read-only audit found zero event/project, location/project, or
  result/sample project mismatches in the current rows.
- Existing `monitoring_locations.drainage_area` is free text. Migration 021
  adds a normalized `drainage_areas` table and nullable composite foreign key
  without deleting the legacy field.
- The live SMARTS event source constraint must be expanded for
  `inspector_upload`; it must not be bypassed in application code.
- Reporting-year columns reject values before 2026. The atomic creation RPC
  also derives the currently open July-June reporting year in California time
  and rejects both closed and not-yet-open reporting years. On the current
  2026-08-07 clock, only 2026-2027 is accepted.
- Bot-run payload linkage is composite: a run cannot reference a payload
  version belonging to a different site record or project.
- Foreign-key paths added by Phase 4 have supporting indexes for user cleanup,
  assignment lookup, retained sources, drainage areas, SMARTS details,
  attachments, payloads, and status history.

## RLS and function findings

All core business tables have RLS, but many legacy policies target the implicit
`public` role instead of `authenticated`. Several UPDATE policies also omit
`WITH CHECK`. These are pre-existing issues and should be handled in a separate
forward-only hardening migration rather than hidden inside Phase 4.

Supabase's security advisor reported:

- mutable function search paths on seven existing trigger functions;
- `public._migrations` exposed without RLS and with broad anon/authenticated
  table grants;
- three public `SECURITY DEFINER` functions executable by anon and
  authenticated roles; and
- leaked-password protection disabled.

Relevant advisor guidance:

- [Mutable function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- [RLS disabled in an exposed schema](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public)
- [Anon-executable security-definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Authenticated-executable security-definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

Phase 4's new policies now target `authenticated`, wrap `auth.uid()` in a
scalar SELECT, use explicit table grants, move the organization-management
helper into a private schema, use fixed empty search paths in new functions,
and revoke direct execution of internal trigger functions.
Child-record writes are limited to the owning inspector or an owner/admin/QSP
for the company; site configuration writes require an owner/admin/QSP role.

## Storage finding

The live project has four private buckets: `checkpoint-photos`, `documents`,
`mission-photos`, and `photos`. However, `storage.objects` has one policy:

```text
allow_all_storage: FOR ALL TO public USING (true) WITH CHECK (true)
```

That policy defeats tenant isolation regardless of the bucket's `public`
flag. Migration 023 removes it, creates a private 50 MiB
`inspection-records` bucket with an explicit MIME allowlist, and grants only:

- authenticated project-scoped SELECT; and
- authenticated owner-inspector INSERT at the canonical six-folder path.

There is intentionally no ordinary-user UPDATE or DELETE policy. Storage
object operations continue to go through the Storage API, never direct writes
to the `storage` schema.

## Required deployment sequence

1. Authorize a feature-restricted management MCP, confirm branch usage cost,
   and create the isolated `phase4-db-validation` branch.
2. Reconcile migration 019 checksum drift without rewriting deployed history.
3. Review migrations 021-023 and the impact of removing
   `allow_all_storage` on a non-production branch or test project.
4. Apply 021, then create inspector profiles and explicit site assignments.
5. Apply 022 and test authenticated same-key retries for all three record
   types, including a 2026-2027 SMARTS event.
6. Apply 023 and verify authorized upload/read plus denied overwrite, delete,
   cross-project, cross-inspector, and anonymous access.
7. Audit legacy rows and validate all `NOT VALID` composite SMARTS
   foreign keys.
8. Run both Supabase security and performance advisors again.
9. Only after these gates, enable Phase 5 inspector ingestion against the live
   hierarchy.

Annual Reports remain out of scope, and no automated certification or legal
submission action is introduced by any Phase 4 migration.

## Development deployment validation

The separate `smarts` project (`jdnyzppdhecncxwgzdur`) was subsequently
restored and used as the isolated Phase 4 development environment. Production
remained read-only and unchanged throughout this work.

The restored database was a mixed-state SiteCheck baseline:

- migrations 001-010 were recorded and matched the local SHA-256 values;
- migrations 011-014 were already present in the schema but absent from the
  custom ledger, so they were probed and recorded without re-executing SQL;
- migrations 015-020 were applied in order and recorded; and
- migrations 021-025 were applied and recorded after per-migration checks.

Migration 024 was added after live ACL verification showed that Supabase's
automatic Data API exposure had explicitly granted `anon` execution on the new
site-record RPC. It removes that explicit grant while retaining
`authenticated` and `service_role`. Migration 025 adds the ten composite
foreign-key indexes identified by the Supabase performance advisor.

Live transaction-scoped synthetic tests verified:

- weekly inspection creation;
- monthly inspection creation;
- 2026-2027 SMARTS ad hoc creation;
- same-key idempotent retry behavior;
- rejection of the closed 2025-2026 reporting year;
- rejection of a not-yet-open future reporting year;
- rejection when the inspector lacks an active site assignment; and
- exactly one typed detail branch per common site record.

All synthetic companies, sites, assignments, inspections, SMARTS events, and
site records were removed after the checks. Original development counts were
restored exactly: 12 projects, 4 inspections, and 19 SMARTS events.

Final database verification found:

- all 11 Phase 4 business tables have RLS enabled;
- the `site_record_directory` view uses `security_invoker=true`;
- the creation RPC is `SECURITY INVOKER`, has an empty search path, is not
  executable by `anon`, and is executable by `authenticated` and
  `service_role`;
- `inspection-records` is private, limited to 50 MiB objects, and has only
  authenticated SELECT and INSERT policies;
- the blanket `allow_all_storage` policy is absent;
- the security advisor reports no Phase 4 findings; and
- the performance advisor reports no unindexed Phase 4 foreign keys.

The deployed development schema was exported to
`src/types/database.generated.ts`. A global typed-client rollout was deferred
because it exposed unrelated pre-existing type drift across legacy routes;
Phase 4 retains its focused Zod boundary and generated schema contract without
expanding the scope into a legacy API refactor.

Final local verification passed TypeScript and 227 SMARTS, integration, and
security tests across 13 files.

## Database-prod UI transition

The restored `smarts` project (`jdnyzppdhecncxwgzdur`) was subsequently
designated as the target database for the new production product. The original
`atbpfdmzwajxxfzfqozq` project remains unchanged. The application environment
has not yet been switched, because the publishable and server service-role
keys must move together to prevent a mixed-project Auth state.

The new inspector UI adds:

- a unified **Field Records** workspace;
- self-service inspector profile setup;
- owner/admin/QSP site-assignment management;
- weekly, monthly, and SMARTS ad hoc creation through the atomic Phase 4 RPC;
- continuation into the existing checklist and SMARTS capture screens;
- company → inspector → site → record history and detail retrieval; and
- private immutable attachments with short-lived signed downloads.

Migrations 026 and 027 keep the common `site_records.workflow_status` aligned
with inspection and SMARTS lifecycle changes. A live rollback test found and
corrected a polymorphic trigger-field bug, then verified inspection and SMARTS
status transitions with zero retained synthetic rows. The post-change advisor
run introduced no new Phase 4 findings.

The release checklist and atomic environment cutover are documented in
`docs/smarts-recon/DATABASE-PROD-UI-RELEASE.md`.
