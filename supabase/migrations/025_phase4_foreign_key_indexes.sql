-- ============================================================
-- 025 - Cover Phase 4 composite foreign keys
-- ============================================================
-- Index every referencing column set reported by Supabase's performance
-- advisor. These indexes support joins and prevent full-table scans when a
-- referenced project, site record, inspection, upload, event, or assignment
-- is updated or deleted.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_site_record_inspections_inspection_project
  ON public.site_record_inspections (inspection_id, project_id);

CREATE INDEX IF NOT EXISTS idx_site_record_inspections_record_project
  ON public.site_record_inspections (site_record_id, project_id);

CREATE INDEX IF NOT EXISTS idx_site_record_sources_record_project
  ON public.site_record_sources (site_record_id, project_id);

CREATE INDEX IF NOT EXISTS idx_site_record_sources_upload_record_project
  ON public.site_record_sources (upload_id, site_record_id, project_id)
  WHERE upload_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_site_record_uploads_record_project
  ON public.site_record_uploads (site_record_id, project_id);

CREATE INDEX IF NOT EXISTS idx_site_records_org_project
  ON public.site_records (org_id, project_id);

CREATE INDEX IF NOT EXISTS idx_site_records_assignment_fk
  ON public.site_records (org_id, project_id, inspector_user_id);

CREATE INDEX IF NOT EXISTS idx_smarts_attachments_record_project
  ON public.smarts_attachments (site_record_id, project_id);

CREATE INDEX IF NOT EXISTS idx_smarts_payload_versions_record_project
  ON public.smarts_payload_versions (site_record_id, project_id);

CREATE INDEX IF NOT EXISTS idx_smarts_report_records_event_project
  ON public.smarts_report_records (smarts_event_id, project_id);
