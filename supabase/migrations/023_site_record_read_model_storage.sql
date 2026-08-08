-- ============================================================
-- 023 - Phase 4 hierarchy read model and private upload storage
-- ============================================================
-- REVIEW-GATED: apply only after migrations 021 and 022.
--
-- The view keeps the product-facing traversal flat and readable while the
-- normalized tables retain their foreign-key authority:
--   company -> inspector -> site -> weekly/monthly/SMARTS record.
--
-- The storage policy intentionally removes the live project's pre-existing
-- blanket `allow_all_storage` policy. Existing SiteCheck storage operations
-- use a server-side service-role client; ordinary users only receive the
-- narrowly scoped inspection-record access defined below.
-- ============================================================

CREATE OR REPLACE VIEW public.site_record_directory
WITH (security_invoker = true)
AS
SELECT
  record.id AS site_record_id,
  record.org_id,
  organization.name AS company_name,
  record.inspector_user_id,
  inspector.display_name AS inspector_name,
  inspector.title AS inspector_title,
  assignment.assignment_role,
  record.project_id,
  project.name AS site_name,
  project.wdid,
  record.record_type,
  record.workflow_status,
  record.title,
  record.observed_from,
  record.observed_to,
  inspection.inspection_id,
  smarts.smarts_event_id,
  smarts.reporting_year_start,
  smarts.portal_report_id,
  smarts.portal_status,
  smarts.readback_status,
  record.created_by,
  record.created_at,
  record.updated_at
FROM public.site_records record
JOIN public.organizations organization
  ON organization.id = record.org_id
JOIN public.inspector_profiles inspector
  ON inspector.org_id = record.org_id
 AND inspector.user_id = record.inspector_user_id
JOIN public.projects project
  ON project.org_id = record.org_id
 AND project.id = record.project_id
JOIN public.project_inspector_assignments assignment
  ON assignment.org_id = record.org_id
 AND assignment.project_id = record.project_id
 AND assignment.inspector_user_id = record.inspector_user_id
LEFT JOIN public.site_record_inspections inspection
  ON inspection.site_record_id = record.id
LEFT JOIN public.smarts_report_records smarts
  ON smarts.site_record_id = record.id;

REVOKE ALL ON TABLE public.site_record_directory FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.site_record_directory
  TO authenticated, service_role;

-- Keep source files private. Object bytes must be uploaded through the Storage
-- API; SQL only owns the bucket configuration and object authorization rules.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) VALUES (
  'inspection-records',
  'inspection-records',
  FALSE,
  52428800,
  ARRAY[
    'application/pdf',
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic'
  ]::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Supabase combines permissive policies with OR. Leaving this policy in place
-- would make every narrower policy below ineffective for every bucket.
DROP POLICY IF EXISTS allow_all_storage ON storage.objects;

CREATE POLICY inspection_records_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'inspection-records'
  AND EXISTS (
    SELECT 1
    FROM public.site_records record
    WHERE record.org_id::TEXT = (storage.foldername(name))[1]
      AND record.inspector_user_id::TEXT = (storage.foldername(name))[2]
      AND record.project_id = (storage.foldername(name))[3]
      AND record.record_type = (storage.foldername(name))[4]
      AND record.id::TEXT = (storage.foldername(name))[5]
      AND (storage.foldername(name))[6] IN ('source', 'attachment', 'photo')
      AND record.project_id IN (SELECT public.auth_user_project_ids())
  )
);

CREATE POLICY inspection_records_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'inspection-records'
  AND EXISTS (
    SELECT 1
    FROM public.site_records record
    WHERE record.org_id::TEXT = (storage.foldername(name))[1]
      AND record.inspector_user_id::TEXT = (storage.foldername(name))[2]
      AND record.project_id = (storage.foldername(name))[3]
      AND record.record_type = (storage.foldername(name))[4]
      AND record.id::TEXT = (storage.foldername(name))[5]
      AND (storage.foldername(name))[6] IN ('source', 'attachment', 'photo')
      AND record.inspector_user_id = (SELECT auth.uid())
      AND record.created_by = (SELECT auth.uid())
  )
);

-- No UPDATE or DELETE policy is granted to ordinary users. Source objects are
-- immutable audit inputs; replacements must use a new object path and hash.
