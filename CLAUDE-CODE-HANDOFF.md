# Claude Code Handoff — SiteCheck Database Prod

Last updated: 2026-08-08  
Repository: `/Users/nealdamireddy/Documents/SiteCheck/Sitecheck-main`

## Read this first

Continue the inspector-facing SiteCheck UI and Supabase field-record work described below. The goal is for an authenticated inspector to create, complete, retrieve, and review weekly inspections, monthly inspections, and SMARTS ad hoc rain-event records, with durable storage in the target Supabase project.

Do **not** resume Annual Report or SMARTS browser-bot work. Do **not** mutate the original Supabase project. Do not delete, reset, clean, commit, push, merge, or deploy without understanding the repository state and receiving any required user authorization.

## Critical repository-state warning

At the time this file was recreated, the main checkout was:

```text
branch: main
commit: 1d141021ebb83d7a51fbc7f51621487eac223f6b
message: demo baseline from Aryav, pre-SMARTS feature
```

This is **not** the checkout in which the Phase 4 work was previously implemented and tested. The earlier checkout was on `hardening-review` with extensive modified and untracked Phase 4 files. During an intervening repository/worktree change, the former untracked `docs` directory and the first copy of this handoff disappeared from the main checkout.

Known local branches include:

- `hardening-review` at `543dd87a32e3f7294c5cce3c978d95b6a99fca4f`
- `feat/inspection-flow`
- `feat/offline-foundations`
- `smarts-feature`
- `smarts-csv-export`

Do not assume the Phase 4 changes were committed to `hardening-review`; many were observed as modified or untracked files. Before implementing anything:

1. Run `git status --short --branch` and `git worktree list`.
2. Inspect branches, reflogs, stashes, dangling commits, Claude worktrees, and any recoverable local state using read-only commands.
3. Do not switch branches, reset, clean, merge, or overwrite files until the user understands what is recoverable.
4. If the Phase 4 implementation cannot be recovered, use this document as the reconstruction contract.

## Current product scope

Build, validate, harden, and prepare these workflows:

1. Weekly inspections
2. Monthly inspections
3. SMARTS ad hoc rain-event data for the open **2026–2027** reporting year
4. Unified Field Records history and detail views
5. Private supporting-document uploads and signed downloads
6. Supabase persistence, authorization, RLS, lifecycle synchronization, and deployment configuration

### Explicit non-goals

- Annual Reports
- Creating reports for the closed 2025–2026 reporting year
- SMARTS browser automation
- Automatic certification, signing, or submission to SMARTS
- Mutating the original/rollback Supabase project
- Deleting E2E or user-created database records without explicit authorization

If browser automation is resumed later, it must remain draft-only and must never certify, sign, or submit a regulatory filing.

## Supabase project boundary

| Purpose | Project reference | Rule |
|---|---|---|
| Target / database prod | `jdnyzppdhecncxwgzdur` | All current inspector UI and database work belongs here |
| Original / rollback | `atbpfdmzwajxxfzfqozq` | Do not mutate or mix credentials with the target |

Never mix URLs or keys between these projects. Never reuse the original project's service-role key or database URL for the target.

An ignored local `.env.development.local` was created with the target public URL and publishable key. Do not print, copy, or commit its values. `.env.local` still referenced the original project, so Next.js must load `.env.development.local` first. Verify the effective project reference without displaying secrets before any browser test or database mutation.

The target service-role/secret key and target database/migration URL were intentionally left blank. Obtain them only from the target Supabase dashboard or approved encrypted deployment environment.

## Required data hierarchy

```text
company / organization
└── inspector profile
    └── active project assignment
        └── site / project
            ├── weekly inspections
            ├── monthly inspections
            └── SMARTS ad hoc records
```

A record may be created only when:

- The user is authenticated.
- The user has an active inspector profile in the organization.
- The user has an active assignment to the selected site/project.
- The site belongs to the same organization.
- The record type is supported.
- SMARTS ad hoc data belongs to the open 2026–2027 reporting year.

Derive ownership from authenticated database relationships. Do not trust client-supplied organization or inspector IDs when the server can derive them.

## Phase 4 database model previously implemented

The previous working tree introduced a common field-record layer over type-specific records.

Important relations:

- `inspector_profiles`
- `project_inspector_assignments`
- `site_records`
- `site_record_inspections`
- `site_record_sources`
- `site_record_uploads`
- `site_record_status_history`
- `site_record_directory` — security-invoker read-model view

The RPC `create_site_record_with_detail` atomically validated the hierarchy and created the common/type-specific linkage.

Lifecycle mapping:

| Operational state | Common record state |
|---|---|
| Inspection draft | `draft` |
| Inspection submitted | `verified` |
| SMARTS event active | `running` |
| SMARTS event ended | `ready` |
| SMARTS workflow completed | `verified` |

Relevant migrations previously present locally and applied/recorded in the target through `027`:

- `018_inspection_checklist_history.sql`
- `019_atomic_checklist_submission.sql`
- `020_fix_checklist_cgp_reference.sql`
- `021_site_record_hierarchy.sql`
- `022_create_site_record.sql`
- `023_site_record_read_model_storage.sql`
- `024_harden_site_record_rpc_acl.sql`
- `025_phase4_foreign_key_indexes.sql`
- `026_sync_field_record_workflow_status.sql`
- `027_fix_smarts_workflow_trigger.sql`

Inspect target migration history before applying anything. Do not blindly reapply migrations.

## UI and API work previously implemented

- Authenticated inspector-workspace endpoint resolving active profiles and assignments.
- Field Records page for weekly, monthly, and SMARTS ad hoc creation.
- Unified history filters and record-detail view.
- Links from common records into their underlying workflow.
- Loading, unavailable, and error states.
- Request-generation guard preventing a stale request for the old project from overwriting target-project state.
- Correct link rendering on record detail using `nativeButton={false}`.
- Caller-scoped authenticated Supabase access on user-facing routes.
- Private attachment metadata, signed downloads, and caller-scoped compensation cleanup.

Previously relevant paths included:

```text
src/app/records/page.tsx
src/app/records/[id]/page.tsx
src/app/api/inspector-workspace/route.ts
src/app/api/site-records/route.ts
src/app/api/site-records/[id]/route.ts
src/app/api/site-records/[id]/uploads/route.ts
src/lib/site-records/create.ts
src/lib/site-records/directory.ts
src/lib/validations/site-record.ts
src/types/site-record.ts
src/components/dashboard/inspection-picker.tsx
src/components/inspections/inspection-checklist-form.tsx
```

These paths may be absent from the current baseline checkout. Recover before rebuilding where possible.

## Important PostgREST fix

A composite foreign key made the relationship between `samples` and `parameter_results` ambiguous. This caused `GET /api/samples` to return 500 and made saved samples appear Pending/0 after reload.

The corrected queries used this explicit relationship hint:

```text
parameter_results!parameter_results_sample_id_fkey
```

The fix had been applied to:

```text
src/app/api/samples/route.ts
src/app/api/samples/[id]/route.ts
src/app/api/reports/generate/route.ts
src/lib/smarts/fetch-export-input.ts
scripts/test-samples.ts
```

## Verified target data and E2E evidence

Successful E2E testing used target site **EQUUS COURT**, project ID `proj-1781102598494-gmyn`, under:

```text
neal's Organization → Neal Damireddy → EQUUS COURT
```

### Weekly

- Site record: `c88475b3-a620-4c55-8893-530c91f74443`
- Inspection: `insp-da74fb7a-ced0-4534-8b7d-09ca5cacc83a`
- Title: `E2E TEST — Weekly inspection 2026-08-07`
- Submitted 22 answers, 0 exceptions
- Common status synchronized to `verified`

### Monthly

- Site record: `666c2af7-db59-4c52-bf81-b7dcedbb97be`
- Inspection: `insp-42d62599-6375-45cd-b9e5-668696f26ea8`
- Title: `E2E TEST — Monthly inspection August 2026`
- Submitted 22 answers, 0 exceptions
- Common status synchronized to `verified`

### SMARTS ad hoc

- Site record: `9b82993b-057d-4fdf-8e16-2f966f1f943b`
- Event: `smarts-evt-7cd5faa8-776c-4d26-97fe-f48b0d4898b1`
- Workflow: `running`
- Reporting-year start: `2026`
- Two samples and four pH/turbidity parameter results persisted and survived reload

### Empty SMARTS test

- Site record: `4945d7fa-0d3a-4c74-8eca-5f17fcedfa83`
- Event: `smarts-evt-7752659d-dc8c-4799-8d00-aea5f2586a47`
- Workflow: `running`
- Reporting-year start: `2026`
- Zero samples

Its title says `E2E TEST — closed year should be rejected`, but Chrome automation failed to set the intended datetime. No invalid closed-year row was stored.

### User-created record after environment repair

- Site record: `edaebe84-c5cd-4aa6-8c90-c52225c3009d`
- Inspection: `insp-0650888d-c8d5-4db2-b409-3fbcc703baf3`
- Status: `draft`

This proved the user's own browser action reached the target database after the environment fix. Do not delete these records without explicit approval.

## Resolved browser error

The user saw:

```text
Site record storage is not available.
```

Root cause: the normal development server loaded the original Supabase public environment instead of database prod. The Phase 4 schema existed in the target, not the effective project.

Resolution: pin local development to the target using ignored `.env.development.local` and restart Next.js. If the error returns, verify the effective target reference and restart before changing application code or database schema.

## Known issues requiring follow-up

### Regulatory/QSP identity mismatch

The common field record identifies `Neal Damireddy`, while submitted checklist snapshots identify `Nilai Damireddy`. The atomic submission RPC preferred the existing `qsp_profiles.name` value (`Nilai Damireddy`) over the inspector/project display name.

Ask the user which spelling is the legal QSP identity before changing data or precedence rules. Do not guess or silently rewrite regulatory history.

### Attachment E2E incomplete

The private upload flow was implemented, but browser upload was blocked because the ChatGPT Chrome extension lacked **Allow access to file URLs**.

User-side action:

1. Open `chrome://extensions`.
2. Open the ChatGPT browser extension's details.
3. Enable **Allow access to file URLs**.
4. Test private upload, signed download, and denial of unauthorized overwrite/delete.

At last check, the E2E records had zero `site_record_uploads` rows.

### Supabase advisor findings

Previously observed:

- `_migrations` has RLS but no policy; it is an operator table.
- Legacy trigger functions have mutable `search_path` warnings.
- SECURITY DEFINER helpers such as `auth_user_org_ids`, `auth_user_project_ids`, and `handle_new_user` need execution/access review.
- Leaked-password protection is disabled.
- RLS auth-initplan performance warnings exist on `qsp_profiles`, `smarts_credentials`, and `smarts_runs`.

Do not blindly revoke helper execution because RLS policies may depend on it. Use a separately reviewed hardening migration and regression-test access afterward.

## Safety rules

- Preserve all user-owned changes and untracked files.
- Never run `git reset --hard`, `git clean`, or broad checkout/revert commands.
- Do not mutate original project `atbpfdmzwajxxfzfqozq`.
- Do not mix original and target credentials.
- Never expose or commit service-role/secret keys.
- User-facing APIs must authenticate and use caller-scoped Supabase clients.
- Data API views must be `security_invoker` unless a reviewed design proves otherwise.
- Use explicit grants compatible with current Supabase Data API behavior.
- Do not delete database test records without permission.
- Keep Annual Reports and browser-bot work out of scope.

## Validation baseline

Before the repository state changed, the last complete validation was:

- `npx tsc --noEmit`: passed
- `npm test`: 612/612 passed across 56 files
- `npm run build`: passed
- `git diff --check`: passed

Normal verification commands:

```bash
npx tsc --noEmit
npm test
npm run build
git diff --check
```

The build may need network access to fetch Google Fonts. Known non-blocking warnings involved the deprecated Next.js middleware convention and Turbopack tracing through the out-of-scope bot sync route.

## Next steps in priority order

1. Recover and inventory the prior Phase 4 working state without destructive Git actions.
2. Compare recovered code with the target Supabase schema and this contract.
3. Ask the user to confirm the legal QSP name, then align the authoritative identity safely.
4. Complete private attachment upload/download/authorization E2E after file-URL permission is enabled.
5. Provision target server credentials only in approved encrypted environments.
6. Re-run TypeScript, tests, production build, migration checks, and Supabase advisors.
7. Deploy the UI atomically against only the target project when explicitly authorized.
8. Run post-deploy smoke tests for auth, site selection, weekly, monthly, SMARTS 2026–2027, Field Records, and attachments.
9. Monitor API, Auth, Postgres, and Storage logs.
10. Address advisor findings in a separately reviewed hardening migration.

## Definition of done

- An authenticated assigned inspector can create weekly, monthly, and SMARTS ad hoc records.
- Records persist in target project `jdnyzppdhecncxwgzdur` under company → inspector → site → record type.
- Inspectors can retrieve and continue authorized records in Field Records.
- Weekly/monthly checklist answers persist and lifecycle status synchronizes.
- SMARTS samples/results persist and reload for the open 2026–2027 year.
- Private attachments pass upload, signed-download, and authorization tests.
- The legal QSP identity is confirmed and consistently snapshotted.
- Deployment uses only target credentials, with no secret exposure or project mixing.
- TypeScript, tests, build, RLS checks, advisors, and smoke tests pass.
- Annual Reports and browser automation remain untouched.

## Suggested first prompt for Claude Code

> Read `/Users/nealdamireddy/Documents/SiteCheck/Sitecheck-main/CLAUDE-CODE-HANDOFF.md` completely. The current `main` checkout is a pre-SMARTS baseline, while Phase 4 previously existed as modified/untracked work under a `hardening-review` checkout. First inspect Git branches, reflogs, stashes, worktrees, and recoverable objects using read-only commands. Do not reset, clean, switch, merge, commit, push, deploy, or mutate either Supabase project. Report what Phase 4 state is recoverable and propose the safest restoration path. Keep Annual Reports and the SMARTS browser bot out of scope. Before changing QSP identity, ask whether the legal name is Neal Damireddy or Nilai Damireddy.
