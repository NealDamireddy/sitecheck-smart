# Database Prod UI Release

## Product boundary

This release treats Supabase project `jdnyzppdhecncxwgzdur` as the target
database for the new SiteCheck product. The original
`atbpfdmzwajxxfzfqozq` project remains unchanged and is the rollback data
source until the cutover is explicitly approved.

The SMARTS browser bot and Annual Reports are out of scope. This release is
the inspector-facing UI and data path for:

- weekly inspections;
- monthly inspections; and
- SMARTS ad hoc rain-event records in the open 2026-2027 reporting year.

## Delivered UI flow

1. The inspector selects a site in the existing top bar.
2. **Field Records** loads the inspector profile and site assignment.
3. A user creates or updates their own inspector profile.
4. An owner, administrator, or QSP assigns active profiles to the site.
5. The inspector starts a weekly, monthly, or SMARTS ad hoc record.
6. The atomic Phase 4 RPC creates the common record and exactly one detail
   branch.
7. Weekly/monthly records open the existing 22-question QSP checklist.
8. SMARTS ad hoc records open the existing field sample-capture page.
9. Checklist or SMARTS status changes automatically update the common record
   directory.
10. The inspector retrieves the record from **Field Records**, opens its
    detail page, views immutable status history, and uploads private source,
    lab, photo, or supporting files.

The product-facing hierarchy is:

```text
company
  -> inspector profile
    -> active site assignment
      -> site
        -> weekly inspection
        -> monthly inspection
        -> SMARTS ad hoc record
```

## Database state

Migrations 001-027 are recorded in `public._migrations` on the target project.
Migrations 026 and 027 add and correct field-workflow status synchronization.

Live rollback-scoped tests verified:

- inspection `submitted` updates the common record to `verified`;
- active SMARTS records begin as `running`;
- SMARTS `completed` updates the common record to `verified`; and
- zero synthetic records remain after rollback.

The post-migration advisors reported no new Phase 4 security or performance
findings. Existing legacy warnings remain separately tracked in the Phase 4
audit.

## Required production configuration

The application must switch all Supabase values as one atomic deployment. Do
not mix keys from the original and target projects.

Required environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://jdnyzppdhecncxwgzdur.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<active publishable or legacy anon key>
SUPABASE_SERVICE_ROLE_KEY=<target-project service-role or secret key>
SUPABASE_DB_URL=<target-project migration connection, server-only>
```

The service-role value is not available from the project-scoped Supabase MCP.
It must be copied from the target Supabase project into the hosting provider's
encrypted environment variables. Never commit it or expose it in a browser
variable.

## Release gates

- [x] Phase 4 schema deployed through the standalone Supabase MCP.
- [x] RLS, Storage policy, RPC ACL, index, and workflow-trigger checks passed.
- [x] Inspector profile and site-assignment API/UI built.
- [x] Weekly/monthly/SMARTS creation UI built.
- [x] Unified record history and detail UI built.
- [x] Private attachment upload and signed-download UI built.
- [x] TypeScript passed.
- [x] Focused suite passed: 75 tests across 11 files.
- [x] Production build passed before the final assignment-UI increment.
- [ ] Configure all target Supabase environment variables together.
- [ ] Sign in to the target project and run an authenticated browser test.
- [ ] Create one real inspector profile and manager-approved site assignment.
- [ ] Run one weekly, one monthly, and one SMARTS 2026-2027 smoke workflow.
- [ ] Verify file upload/read and denied overwrite/delete behavior.
- [ ] Deploy to the hosting production environment.
- [ ] Monitor Auth, PostgREST, Storage, and application errors after release.

## Rollback

If an authenticated smoke test fails, leave the original project untouched,
restore the hosting environment variables to the complete original key set,
and redeploy the last known-good application artifact. Do not attempt a
partial key rollback. Records created in the target project remain isolated
there for diagnosis.
