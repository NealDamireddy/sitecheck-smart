# Claude Code Handoff — Database Prod / Inspector Field Records

Last updated: 2026-08-08  
Repository: `/Users/nealdamireddy/Documents/SiteCheck/Sitecheck-main`  
Current Git branch: `hardening-review`  
User's working name for this body of work: **database prod**

## Read this first

Continue the inspector-facing UI and Supabase-backed field-record work described here. The immediate product goal is to let an authenticated inspector create, complete, retrieve, and review weekly inspections, monthly inspections, and SMARTS ad hoc rain-event records from the software, with all durable data stored in the target Supabase project.

Do not resume the SMARTS browser bot or Annual Report work. Do not mutate the original Supabase project. Inspect the dirty worktree before changing anything and preserve every unrelated or pre-existing change.

The more detailed release record is in `docs/smarts-recon/DATABASE-PROD-UI-RELEASE.md`. The older `smarts-automation/HANDOFF.md` concerns browser-bot work and is not the active scope.

## Current scope

Build, validate, harden, and prepare the following inspector workflows for deployment:

1. Weekly inspections
2. Monthly inspections
3. SMARTS ad hoc rain-event data for the open **2026–2027** reporting year
4. Unified Field Records history and record-detail views
5. Private supporting-document uploads and signed downloads
6. Supabase persistence, authorization, RLS, lifecycle synchronization, and deployment configuration

### Explicit non-goals

- Annual Reports
- Creating reports for the closed 2025–2026 reporting year
- The SMARTS browser automation bot
- Automatic certification or submission to the SMARTS website
- Changes to the original/rollback Supabase project
- Deleting E2E or user-created records without explicit authorization

If browser automation is resumed later, it must remain draft-only: it may navigate and fill fields, but it must never certify, sign, or submit a regulatory filing.

## Supabase project boundary

| Purpose | Project reference | Rule |
|---|---|---|
| Target / database prod | `jdnyzppdhecncxwgzdur` | All current UI and database-prod work belongs here |
| Original / rollback | `atbpfdmzwajxxfzfqozq` | Read only when specifically required; do not mutate |

Never mix URLs or keys between these projects. Never reuse the original project's service-role key or database URL for the target project.

Local development is pinned to the target public client through ignored file `.env.development.local`. It contains the target Supabase URL and target publishable key. Do not print, copy into this document, or commit any key.

The target service-role/secret key and target database/migration URL are not yet configured locally. Their corresponding local values are intentionally blank. Obtain them only from the target Supabase dashboard or the approved encrypted hosting environment. Some admin-only scripts or migration operations will remain unavailable until those values are supplied.

Next.js loads `.env.development.local` before `.env.local`. `.env.local` still references the original project, so always confirm the effective project reference without revealing secrets before running a browser test or data mutation.

## Product data hierarchy

The required ownership and retrieval structure is:

```text
company / organization
└── inspector profile
    └── active project assignment
        └── site / project
            ├── weekly inspection records
            ├── monthly inspection records
            └── SMARTS ad hoc records
```

A user may create a field record only when all of the following are true:

- The user is authenticated.
- The user has an active inspector profile in the organization.
- The user has an active assignment to the selected project/site.
- The project/site belongs to the same organization.
- The requested record type is supported.
- SMARTS ad hoc data belongs to the open 2026–2027 reporting year.

The app should derive ownership from authenticated database relationships. Do not trust client-supplied organization or inspector identifiers when the server can derive them.

## Common record model

The Phase 4 implementation introduced a common field-record layer over type-specific operational records.

Important relations:

- `inspector_profiles`
- `project_inspector_assignments`
- `site_records`
- `site_record_inspections`
- `site_record_sources`
- `site_record_uploads`
- `site_record_status_history`
- `site_record_directory` — security-invoker read-model view

Creation is performed by the `create_site_record_with_detail` RPC so hierarchy validation and common/type-specific linking occur atomically.

Lifecycle synchronization currently follows these rules:

| Operational state | Common field-record state |
|---|---|
| Inspection draft | `draft` |
| Inspection submitted | `verified` |
| SMARTS event active | `running` |
| SMARTS event ended | `ready` |
| SMARTS workflow completed | `verified` |

The Field Records UI reads the common directory, then links users to the underlying weekly, monthly, or SMARTS workflow.

## Relevant migrations

The target project has migrations through `027` applied/recorded. Relevant local migrations are:

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

Do not reapply migrations blindly. Inspect the target migration history first. Any new security migration should be separately reviewed and tested before deployment.

## Work delivered so far

### Inspector workspace and field-record UI

- Added an authenticated inspector workspace endpoint that resolves the active profile and project/site assignments.
- Added a Field Records page for creating weekly, monthly, and SMARTS ad hoc records.
- Added unified record-history filtering and record detail.
- Added type-specific continuation links into checklist or SMARTS workflows.
- Added clear unavailable/loading/error states.
- Added mount gating and a request-generation guard to prevent a stale request for the old project from overwriting valid target-project state.
- Corrected link rendering on the record-detail page with `nativeButton={false}`.

### Persistence and authorization

- Added the common record tables, directory view, hierarchy constraints, source links, uploads, and status history.
- Added atomic site-record creation.
- Added status synchronization from inspection and SMARTS lifecycle changes.
- Hardened user-facing routes to use authenticated, caller-scoped Supabase clients.
- Kept the directory view as `security_invoker`.
- Updated route security inventory for the new endpoints.

### SMARTS sample reload fix

Adding a composite foreign key made the PostgREST relationship between `samples` and `parameter_results` ambiguous. This caused `GET /api/samples` to return 500 and made previously saved sample results appear as Pending/0 after reload.

Queries now use the explicit relationship hint:

```text
parameter_results!parameter_results_sample_id_fkey
```

The fix was applied to the samples APIs, report generation/export fetch, and sample test script.

### Attachment security adjustment

The user-facing upload route no longer uses `createAdminClient` for compensation cleanup. Failed-upload cleanup now uses the authenticated caller's RLS-scoped storage client. The bucket is private and retrieval uses signed URLs.

## Browser and database test evidence

All successful E2E tests below used target site **EQUUS COURT**, project ID `proj-1781102598494-gmyn`, under:

```text
neal's Organization → Neal Damireddy → EQUUS COURT
```

The inspector profile and project assignment were active, with assignment role `inspector`.

### Weekly inspection

- Site record: `c88475b3-a620-4c55-8893-530c91f74443`
- Inspection: `insp-da74fb7a-ced0-4534-8b7d-09ca5cacc83a`
- Title: `E2E TEST — Weekly inspection 2026-08-07`
- Result: 22 answers submitted, 0 exceptions
- Inspection status: submitted
- Common field-record status: automatically synchronized to `verified`

### Monthly inspection

- Site record: `666c2af7-db59-4c52-bf81-b7dcedbb97be`
- Inspection: `insp-42d62599-6375-45cd-b9e5-668696f26ea8`
- Title: `E2E TEST — Monthly inspection August 2026`
- Result: 22 answers submitted, 0 exceptions
- Inspection status: submitted
- Common field-record status: automatically synchronized to `verified`

### SMARTS ad hoc

- Site record: `9b82993b-057d-4fdf-8e16-2f966f1f943b`
- Event: `smarts-evt-7cd5faa8-776c-4d26-97fe-f48b0d4898b1`
- Workflow status: `running`
- Reporting-year start: `2026`
- Result: 2 samples and 4 parameter results, covering pH and turbidity at two locations

### Additional empty SMARTS test

- Site record: `4945d7fa-0d3a-4c74-8eca-5f17fcedfa83`
- Event: `smarts-evt-7752659d-dc8c-4799-8d00-aea5f2586a47`
- Workflow status: `running`
- Samples: 0
- Actual reporting-year start: `2026`

Its title is misleading — `E2E TEST — closed year should be rejected` — because Chrome automation could not set the datetime input as intended. No closed-year record was stored.

### User-created record after environment repair

- Site record: `edaebe84-c5cd-4aa6-8c90-c52225c3009d`
- Inspection: `insp-0650888d-c8d5-4db2-b409-3fbcc703baf3`
- Status: draft
- Hierarchy: the same target organization, inspector, and site

This record was created by the user's own browser action after the local environment fix. It confirms the UI now reaches the target database.

Do not delete any of these records without explicit user approval.

## Resolved browser error

The user previously saw:

```text
Site record storage is not available.
```

Root cause: the normal development server was loading the original project's public Supabase environment instead of database prod. The Phase 4 schema existed in the target but not in that effective environment.

Resolution: add ignored `.env.development.local` with the target URL and target publishable key, then restart the Next.js development server. The error disappeared and the user's weekly draft persisted to the target project.

If this error returns, first verify the effective project reference and server restart. Do not patch around a missing table or RPC until the environment has been ruled out.

## Known issues and remaining blockers

### 1. Regulatory/QSP name mismatch — requires user confirmation

The unified field record identifies the inspector as `Neal Damireddy`, while a submitted inspection/checklist snapshot changes the name to `Nilai Damireddy`.

The atomic checklist submission RPC currently prefers the existing `qsp_profiles.name`, whose stored value is `Nilai Damireddy`, over the inspector-profile/project display name.

Do not guess which spelling is legally correct. Ask the user to confirm the legal QSP identity before changing data, precedence rules, or tests. Once confirmed, align the authoritative QSP profile and ensure new regulatory snapshots use it consistently. Preserve historical records unless the user explicitly authorizes a correction strategy.

### 2. Attachment flow is not fully browser-verified

The UI and private-storage implementation exist, but browser upload was blocked because the ChatGPT Chrome extension did not have permission to access local file URLs.

Required user-side setting:

1. Open `chrome://extensions`.
2. Open the ChatGPT browser extension's **Details** page.
3. Enable **Allow access to file URLs**.
4. Retest upload, signed download, and unauthorized overwrite/delete behavior.

At last check, E2E records had zero rows in `site_record_uploads` because the upload never completed.

### 3. Target server credentials are missing

The target service-role/secret key and database URL still need to be provisioned in the approved local/deployment secret store. They are needed for applicable admin/migration workflows, but must never be exposed client-side or committed.

### 4. Existing Supabase advisor findings

Last observed security findings:

- One informational result: `_migrations` has RLS enabled but no policy; it is an operator table.
- Mutable `search_path` warnings on legacy trigger functions.
- Public/authenticated execution exposure on SECURITY DEFINER helpers such as `auth_user_org_ids`, `auth_user_project_ids`, and `handle_new_user`.
- Leaked-password protection is disabled.

Last observed performance findings:

- RLS auth-initplan warnings on `qsp_profiles`, `smarts_credentials`, and `smarts_runs`.

Do not blindly revoke execution from the auth helper functions; RLS policies may depend on them. Create a separately reviewed hardening migration and verify authorization behavior afterward.

## Important files

### Current handoff and design records

- `docs/smarts-recon/CLAUDE-CODE-HANDOFF.md`
- `docs/smarts-recon/DATABASE-PROD-UI-RELEASE.md`
- `docs/smarts-recon/PHASE-4-DATA-ARCHITECTURE.md`
- `docs/smarts-recon/PHASE-4-SUPABASE-AUDIT.md`
- `docs/smarts-recon/DATA-CONTRACT.md`

### UI and API

- `src/app/records/page.tsx`
- `src/app/records/[id]/page.tsx`
- `src/app/api/inspector-workspace/route.ts`
- `src/app/api/site-records/route.ts`
- `src/app/api/site-records/[id]/route.ts`
- `src/app/api/site-records/[id]/uploads/route.ts`
- `src/components/dashboard/inspection-picker.tsx`
- `src/components/inspections/inspection-checklist-form.tsx`

### Data access, validation, and types

- `src/lib/site-records/create.ts`
- `src/lib/site-records/directory.ts`
- `src/lib/validations/site-record.ts`
- `src/types/site-record.ts`

### Sample relationship fix

- `src/app/api/samples/route.ts`
- `src/app/api/samples/[id]/route.ts`
- `src/app/api/reports/generate/route.ts`
- `src/lib/smarts/fetch-export-input.ts`
- `scripts/test-samples.ts`

### Security and workflow tests

- `tests/support/route-manifest.ts`
- `tests/cgp/checklist-field-workflow.test.ts`

## Worktree safety

The worktree is intentionally very dirty. It contains many modified and untracked files from several workstreams, including Phase 4. Treat every existing change as user-owned.

- Start with `git status --short --branch`.
- Do not run `git reset --hard`, `git checkout --`, `git clean`, or equivalent destructive commands.
- Do not revert files merely because they are unrelated to the current task.
- Do not commit, push, or deploy unless the user explicitly asks.
- Keep `.env.development.local` local and ignored.
- Never print secret values into logs or chat.

## Local run and verification

From the repository root:

```bash
npm install
npm run dev
```

Before browser testing, verify the development server reports that it loaded `.env.development.local` and confirm the effective public Supabase URL contains project reference `jdnyzppdhecncxwgzdur`. Do not echo keys.

Run the proportional validation suite after changes:

```bash
npx tsc --noEmit
npm test
npm run build
git diff --check
```

Last known full validation result:

- TypeScript: passed
- Tests: 612/612 passed across 56 files
- Production build: passed
- `git diff --check`: passed

The build may need network access to download Google Fonts. A restricted-network font-fetch failure does not by itself indicate an application regression. Prefer self-hosting the fonts later if deterministic offline builds are required.

Known non-blocking build warnings:

- Next.js middleware convention is deprecated in favor of the proxy convention.
- Turbopack reports a whole-project tracing warning from the out-of-scope bot sync import path.

## Recommended next steps, in order

1. **Establish a clean baseline without altering the worktree.** Read this file and the release record, inspect `git status`, confirm the target environment without printing secrets, and rerun TypeScript/tests as needed.
2. **Resolve QSP identity only after confirmation.** Ask whether the legal regulatory name is `Neal Damireddy` or `Nilai Damireddy`; then implement and test the approved authoritative-identity rule.
3. **Finish attachment E2E.** After the user enables file-URL access, verify private upload, immutable metadata, signed download, and denial of cross-user overwrite/delete.
4. **Provision target server secrets.** Add the target service-role/secret key and target database URL only to approved encrypted environments. Never copy the original project's values.
5. **Prepare deployment atomically.** Configure all target URL/key values together, apply only reviewed pending migrations, deploy the UI, and avoid a mixed-project intermediate state.
6. **Run post-deploy smoke tests.** Cover authentication, site selection, workspace readiness, weekly create/submit/read, monthly create/submit/read, SMARTS 2026–2027 create/sample/review, Field Records retrieval, and attachment upload/download.
7. **Monitor production.** Review API, Auth, Postgres, and Storage logs for authorization failures, 4xx/5xx spikes, RPC errors, and upload failures.
8. **Perform Supabase hardening.** Address advisor findings in a separately reviewed migration, rerun advisors, and regression-test RLS and all three workflows.
9. **Keep bot work deferred.** Resume it only when the user explicitly changes scope.

## Post-deploy smoke-test expectations

For each test, verify both the UI result and the target database row/linkage:

| Workflow | Expected result |
|---|---|
| Authentication | Authenticated user loads only authorized organizations/sites |
| Workspace | Active inspector profile and assignment resolve correctly |
| Weekly | Common record + inspection created; checklist submits; status syncs to `verified` |
| Monthly | Common record + inspection created; checklist submits; status syncs to `verified` |
| SMARTS ad hoc | Only open 2026–2027 reporting-year data is accepted; samples/results survive reload |
| Record history | Records are grouped and filterable by company, inspector, site, and type |
| Record detail | Correct underlying workflow and metadata are displayed |
| Attachments | Private upload succeeds; authorized signed download succeeds; unauthorized access fails |

## Definition of done for the current UI/database-prod scope

This phase is complete when:

- An authenticated, assigned inspector can create weekly, monthly, and SMARTS ad hoc records from the product UI.
- All records persist in target project `jdnyzppdhecncxwgzdur` with the correct company → inspector → site → record-type hierarchy.
- Inspectors can retrieve and continue their authorized records through Field Records.
- Weekly and monthly checklist submissions persist all answers and synchronize the common record lifecycle.
- SMARTS ad hoc samples and parameter results persist and reload correctly for 2026–2027.
- Private attachments pass upload, signed-download, and authorization tests.
- Regulatory/QSP identity is confirmed and consistently snapshotted.
- Target deployment secrets are configured without leaking or mixing credentials.
- TypeScript, automated tests, production build, Supabase advisors, RLS checks, and post-deploy smoke tests pass at an acceptable release threshold.
- Annual Reports and bot automation remain untouched unless explicitly brought back into scope.

## Suggested first instruction for Claude Code

> Read `docs/smarts-recon/CLAUDE-CODE-HANDOFF.md` and `docs/smarts-recon/DATABASE-PROD-UI-RELEASE.md` completely. Inspect `git status --short --branch` and preserve all existing changes. Do not reset, clean, commit, push, deploy, or mutate the original Supabase project. Verify that local development resolves to target project `jdnyzppdhecncxwgzdur` without printing secrets, then run the relevant type and test checks. Before changing QSP identity, ask me whether the legal name is Neal Damireddy or Nilai Damireddy. Keep Annual Reports and the SMARTS browser bot out of scope.
