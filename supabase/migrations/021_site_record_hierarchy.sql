-- ============================================================
-- 021 - Company -> inspector -> site -> record hierarchy
-- ============================================================
-- REVIEW-GATED: do not apply to production until the migration and its RLS
-- policies have been reviewed against the active Supabase schema.
--
-- This migration creates one routing spine for all inspector-originated data:
--
--   organizations
--     -> inspector_profiles
--       -> project_inspector_assignments
--         -> projects (the existing site authority)
--           -> site_records
--              -> site_record_inspections (weekly/monthly)
--              -> smarts_report_records (SMARTS Ad Hoc)
--
-- It does not duplicate inspection or SMARTS detail rows. The existing
-- inspections, smarts_events, monitoring_locations, samples, and
-- parameter_results tables remain the normalized authorities.
-- ============================================================

-- Composite keys used below ensure a child cannot silently cross company or
-- site boundaries. Existing primary keys remain unchanged.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_id_id
  ON projects(org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inspections_id_project
  ON inspections(id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_smarts_events_id_project
  ON smarts_events(id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_monitoring_locations_id_project
  ON monitoring_locations(id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_samples_id_project
  ON samples(id, project_id);

-- ============================================================
-- 1. Inspector directory inside a company
-- ============================================================
-- auth.users remains the authentication authority. This table contains only
-- application-facing identity fields that company members need to display.
CREATE TABLE inspector_profiles (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  title TEXT,
  license_number TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id),
  FOREIGN KEY (user_id, org_id)
    REFERENCES org_memberships(user_id, org_id) ON DELETE CASCADE,
  CHECK (BTRIM(display_name) <> '')
);

-- The primary key starts with org_id; auth-user deletion and user-centric
-- directory lookups also need a user_id-leading index.
CREATE INDEX idx_inspector_profiles_user
  ON inspector_profiles(user_id, org_id);

-- ============================================================
-- 2. Explicit inspector-to-site assignment
-- ============================================================
CREATE TABLE project_inspector_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  inspector_user_id UUID NOT NULL,
  assignment_role TEXT NOT NULL DEFAULT 'inspector'
    CHECK (assignment_role IN ('lead', 'inspector', 'reviewer')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  UNIQUE (org_id, project_id, inspector_user_id),
  FOREIGN KEY (org_id, project_id)
    REFERENCES projects(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, inspector_user_id)
    REFERENCES inspector_profiles(org_id, user_id) ON DELETE RESTRICT,
  CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);

CREATE INDEX idx_project_inspector_assignments_inspector
  ON project_inspector_assignments(org_id, inspector_user_id, status);
CREATE INDEX idx_project_inspector_assignments_project
  ON project_inspector_assignments(project_id, status);
CREATE INDEX idx_project_inspector_assignments_assigned_by
  ON project_inspector_assignments(assigned_by)
  WHERE assigned_by IS NOT NULL;

-- ============================================================
-- 3. Common site-record spine
-- ============================================================
-- record_type is intentionally narrow. SMARTS Annual Reports are not part of
-- this model or product phase.
CREATE TABLE site_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  inspector_user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (
    record_type IN ('weekly_inspection', 'monthly_inspection', 'smarts_ad_hoc')
  ),
  workflow_status TEXT NOT NULL DEFAULT 'draft' CHECK (
    workflow_status IN (
      'draft', 'validating', 'ready', 'running', 'needs_review',
      'verified', 'failed', 'archived'
    )
  ),
  title TEXT,
  observed_from TIMESTAMPTZ,
  observed_to TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, project_id),
  UNIQUE (org_id, idempotency_key),
  FOREIGN KEY (org_id, project_id)
    REFERENCES projects(org_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, project_id, inspector_user_id)
    REFERENCES project_inspector_assignments(
      org_id, project_id, inspector_user_id
    ) ON DELETE RESTRICT,
  CHECK (
    BTRIM(idempotency_key) <> '' AND CHAR_LENGTH(idempotency_key) <= 200
  ),
  CHECK (observed_to IS NULL OR observed_from IS NULL OR observed_to >= observed_from)
);

CREATE INDEX idx_site_records_company_inspector_site_type
  ON site_records(
    org_id, inspector_user_id, project_id, record_type, created_at DESC
  );
CREATE INDEX idx_site_records_project_type_status
  ON site_records(project_id, record_type, workflow_status, created_at DESC);
CREATE INDEX idx_site_records_inspector
  ON site_records(inspector_user_id, created_at DESC);
CREATE INDEX idx_site_records_created_by
  ON site_records(created_by, created_at DESC);

-- Inspector-entered SMARTS events are distinct from NOAA detections and demo
-- simulations. The event still passes through the same normalization path.
ALTER TABLE smarts_events
  DROP CONSTRAINT smarts_events_source_check,
  ADD CONSTRAINT smarts_events_source_check
    CHECK (source IN ('noaa', 'simulated', 'inspector_upload'));

-- Weekly and monthly records reuse the established inspection/checklist
-- tables. This link supplies the common hierarchy without copying answers,
-- findings, photos, or immutable checklist snapshots.
CREATE TABLE site_record_inspections (
  site_record_id UUID PRIMARY KEY,
  project_id TEXT NOT NULL,
  inspection_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (site_record_id, project_id)
    REFERENCES site_records(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (inspection_id, project_id)
    REFERENCES inspections(id, project_id) ON DELETE RESTRICT
);

-- ============================================================
-- 4. Original inspector input and private object metadata
-- ============================================================
-- File bytes live in the private `inspection-records` Supabase Storage bucket.
-- The canonical object path is:
--   {org_id}/{inspector_user_id}/{project_id}/{record_type}/{site_record_id}/
--     {source|attachment|photo}/{safe_filename}
-- PostgreSQL stores the immutable identity, hash, and upload lifecycle.
CREATE TABLE site_record_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_record_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  file_role TEXT NOT NULL CHECK (
    file_role IN ('source', 'lab_result', 'photo', 'supporting_document')
  ),
  storage_bucket TEXT NOT NULL DEFAULT 'inspection-records',
  storage_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  upload_status TEXT NOT NULL DEFAULT 'stored' CHECK (
    upload_status IN ('stored', 'verified', 'rejected', 'quarantined')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, site_record_id, project_id),
  FOREIGN KEY (site_record_id, project_id)
    REFERENCES site_records(id, project_id) ON DELETE RESTRICT
);

CREATE INDEX idx_site_record_uploads_record
  ON site_record_uploads(site_record_id, created_at);
CREATE INDEX idx_site_record_uploads_hash
  ON site_record_uploads(project_id, sha256);
CREATE INDEX idx_site_record_uploads_uploaded_by
  ON site_record_uploads(uploaded_by, created_at DESC);

-- Raw structured input is retained separately from normalized records. This
-- covers mobile forms and APIs that do not originate as a file.
CREATE TABLE site_record_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_record_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('form', 'file', 'api')),
  upload_id UUID,
  raw_payload JSONB,
  payload_sha256 TEXT CHECK (
    payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  schema_version TEXT NOT NULL,
  captured_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (site_record_id, project_id)
    REFERENCES site_records(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (upload_id, site_record_id, project_id)
    REFERENCES site_record_uploads(id, site_record_id, project_id)
      ON DELETE RESTRICT,
  CHECK (upload_id IS NOT NULL OR raw_payload IS NOT NULL)
);

CREATE INDEX idx_site_record_sources_record
  ON site_record_sources(site_record_id, captured_at);
CREATE INDEX idx_site_record_sources_upload
  ON site_record_sources(upload_id)
  WHERE upload_id IS NOT NULL;
CREATE INDEX idx_site_record_sources_captured_by
  ON site_record_sources(captured_by, captured_at DESC);

-- ============================================================
-- 5. SMARTS-specific normalized report root
-- ============================================================
CREATE TABLE smarts_report_records (
  site_record_id UUID PRIMARY KEY,
  project_id TEXT NOT NULL,
  smarts_event_id TEXT NOT NULL UNIQUE,
  reporting_year_start INTEGER NOT NULL
    CHECK (reporting_year_start BETWEEN 2026 AND 2200),
  portal_report_id TEXT,
  portal_status TEXT,
  readback_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    readback_status IN ('pending', 'matched', 'mismatch', 'unavailable')
  ),
  readback_payload JSONB,
  readback_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_record_id, project_id),
  FOREIGN KEY (site_record_id, project_id)
    REFERENCES site_records(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (smarts_event_id, project_id)
    REFERENCES smarts_events(id, project_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_smarts_report_records_portal_report
  ON smarts_report_records(portal_report_id)
  WHERE portal_report_id IS NOT NULL;
CREATE INDEX idx_smarts_report_records_year
  ON smarts_report_records(project_id, reporting_year_start);

-- Every bot launch references an immutable normalized payload version. New
-- inspector edits create a new version; they never rewrite what an older run
-- attempted to enter in SMARTS.
CREATE TABLE smarts_payload_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_record_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  schema_version TEXT NOT NULL,
  normalized_payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, site_record_id, project_id),
  UNIQUE (site_record_id, version_number),
  UNIQUE (site_record_id, payload_sha256),
  FOREIGN KEY (site_record_id, project_id)
    REFERENCES smarts_report_records(site_record_id, project_id)
      ON DELETE RESTRICT
);

CREATE INDEX idx_smarts_payload_versions_record
  ON smarts_payload_versions(site_record_id, version_number DESC);
CREATE INDEX idx_smarts_payload_versions_created_by
  ON smarts_payload_versions(created_by, created_at DESC);

-- ============================================================
-- 6. Portal entities missing from migration 009
-- ============================================================
CREATE TABLE drainage_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  acreage NUMERIC(12, 3) CHECK (acreage IS NULL OR acreage >= 0),
  description TEXT,
  portal_record_id TEXT,
  portal_option_value TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name),
  UNIQUE (id, project_id)
);

CREATE INDEX idx_drainage_areas_project_status
  ON drainage_areas(project_id, status);

ALTER TABLE monitoring_locations
  ADD COLUMN drainage_area_id UUID,
  ADD COLUMN water_body TEXT,
  ADD COLUMN coordinate_datum TEXT NOT NULL DEFAULT 'WGS84',
  ADD COLUMN portal_record_id TEXT,
  ADD COLUMN portal_option_value TEXT,
  ADD CONSTRAINT monitoring_locations_drainage_area_project_fk
    FOREIGN KEY (drainage_area_id, project_id)
    REFERENCES drainage_areas(id, project_id)
    ON DELETE RESTRICT NOT VALID;

CREATE INDEX idx_monitoring_locations_drainage_area_project
  ON monitoring_locations(drainage_area_id, project_id)
  WHERE drainage_area_id IS NOT NULL;

ALTER TABLE samples
  ADD COLUMN portal_sample_id TEXT;

CREATE UNIQUE INDEX idx_samples_portal_sample_id
  ON samples(portal_sample_id)
  WHERE portal_sample_id IS NOT NULL;

-- Enforce project consistency for all new SMARTS detail rows without blocking
-- deployment on possible legacy inconsistencies. Existing rows are audited and
-- these NOT VALID constraints are validated deliberately before rollout.
ALTER TABLE samples
  ADD CONSTRAINT samples_event_project_fk
    FOREIGN KEY (smarts_event_id, project_id)
    REFERENCES smarts_events(id, project_id)
    ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT samples_location_project_fk
    FOREIGN KEY (monitoring_location_id, project_id)
    REFERENCES monitoring_locations(id, project_id)
    ON DELETE RESTRICT NOT VALID;

CREATE INDEX idx_samples_event_project
  ON samples(smarts_event_id, project_id);
CREATE INDEX idx_samples_location_project
  ON samples(monitoring_location_id, project_id);

ALTER TABLE parameter_results
  ADD CONSTRAINT parameter_results_sample_project_fk
    FOREIGN KEY (sample_id, project_id)
    REFERENCES samples(id, project_id)
    ON DELETE CASCADE NOT VALID;

CREATE TABLE smarts_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_record_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  upload_id UUID NOT NULL,
  attachment_type TEXT NOT NULL DEFAULT 'laboratory_results'
    CHECK (attachment_type IN ('laboratory_results', 'supporting_document')),
  portal_filename TEXT NOT NULL CHECK (
    BTRIM(portal_filename) <> '' AND CHAR_LENGTH(portal_filename) <= 30
  ),
  portal_attachment_id TEXT,
  portal_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    portal_status IN ('pending', 'uploaded', 'verified', 'failed')
  ),
  uploaded_to_portal_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_record_id, upload_id),
  FOREIGN KEY (site_record_id, project_id)
    REFERENCES smarts_report_records(site_record_id, project_id)
      ON DELETE RESTRICT,
  FOREIGN KEY (upload_id, site_record_id, project_id)
    REFERENCES site_record_uploads(id, site_record_id, project_id)
      ON DELETE RESTRICT
);

CREATE INDEX idx_smarts_attachments_upload
  ON smarts_attachments(upload_id, site_record_id, project_id);

-- ============================================================
-- 7. Durable bot-run linkage and readback audit
-- ============================================================
ALTER TABLE smarts_runs
  ADD COLUMN site_record_id UUID,
  ADD COLUMN payload_version_id UUID,
  ADD COLUMN portal_report_id TEXT,
  ADD COLUMN reporting_year_start INTEGER
    CHECK (reporting_year_start IS NULL OR reporting_year_start BETWEEN 2026 AND 2200),
  ADD COLUMN bot_version TEXT,
  ADD COLUMN selector_version TEXT,
  ADD COLUMN readback_status TEXT CHECK (
    readback_status IS NULL OR
    readback_status IN ('pending', 'matched', 'mismatch', 'unavailable')
  ),
  ADD COLUMN readback_summary JSONB,
  ADD CONSTRAINT smarts_runs_payload_requires_site_record
    CHECK (payload_version_id IS NULL OR site_record_id IS NOT NULL),
  ADD CONSTRAINT smarts_runs_site_record_project_fk
    FOREIGN KEY (site_record_id, project_id)
    REFERENCES smarts_report_records(site_record_id, project_id)
    ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT smarts_runs_payload_site_record_project_fk
    FOREIGN KEY (payload_version_id, site_record_id, project_id)
    REFERENCES smarts_payload_versions(id, site_record_id, project_id)
    ON DELETE RESTRICT NOT VALID;

CREATE INDEX idx_smarts_runs_site_record
  ON smarts_runs(site_record_id, started_at DESC)
  WHERE site_record_id IS NOT NULL;
CREATE INDEX idx_smarts_runs_payload_site_record
  ON smarts_runs(payload_version_id, site_record_id, project_id)
  WHERE payload_version_id IS NOT NULL;

-- Append-only workflow history makes transitions visible without using logs as
-- the source of truth.
CREATE TABLE site_record_status_history (
  id BIGSERIAL PRIMARY KEY,
  site_record_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (site_record_id, project_id)
    REFERENCES site_records(id, project_id) ON DELETE RESTRICT
);

CREATE INDEX idx_site_record_status_history_record
  ON site_record_status_history(site_record_id, project_id, changed_at);
CREATE INDEX idx_site_record_status_history_changed_by
  ON site_record_status_history(changed_by, changed_at DESC)
  WHERE changed_by IS NOT NULL;

-- ============================================================
-- 8. Type and immutability guards
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_site_record_subtype()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_record_type TEXT;
BEGIN
  SELECT record_type INTO v_record_type
  FROM public.site_records
  WHERE id = NEW.site_record_id;

  IF TG_TABLE_NAME = 'site_record_inspections'
     AND v_record_type NOT IN ('weekly_inspection', 'monthly_inspection') THEN
    RAISE EXCEPTION 'SITE_RECORD_TYPE_MISMATCH';
  END IF;

  IF TG_TABLE_NAME = 'smarts_report_records'
     AND v_record_type <> 'smarts_ad_hoc' THEN
    RAISE EXCEPTION 'SITE_RECORD_TYPE_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER site_record_inspections_type_guard
  BEFORE INSERT OR UPDATE ON site_record_inspections
  FOR EACH ROW EXECUTE FUNCTION enforce_site_record_subtype();

CREATE TRIGGER smarts_report_records_type_guard
  BEFORE INSERT OR UPDATE ON smarts_report_records
  FOR EACH ROW EXECUTE FUNCTION enforce_site_record_subtype();

CREATE OR REPLACE FUNCTION public.protect_site_record_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (
    NEW.org_id,
    NEW.project_id,
    NEW.inspector_user_id,
    NEW.record_type,
    NEW.idempotency_key
  )
     IS DISTINCT FROM
     (
       OLD.org_id,
       OLD.project_id,
       OLD.inspector_user_id,
       OLD.record_type,
       OLD.idempotency_key
     ) THEN
    RAISE EXCEPTION 'SITE_RECORD_IDENTITY_IS_IMMUTABLE';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER site_records_identity_guard
  BEFORE UPDATE ON site_records
  FOR EACH ROW EXECUTE FUNCTION protect_site_record_identity();

CREATE OR REPLACE FUNCTION public.record_site_record_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.site_record_status_history (
      site_record_id, project_id, from_status, to_status, changed_by
    ) VALUES (
      NEW.id, NEW.project_id, NULL, NEW.workflow_status, NEW.created_by
    );
  ELSIF NEW.workflow_status IS DISTINCT FROM OLD.workflow_status THEN
    INSERT INTO public.site_record_status_history (
      site_record_id, project_id, from_status, to_status, changed_by
    ) VALUES (
      NEW.id, NEW.project_id, OLD.workflow_status, NEW.workflow_status,
      (SELECT auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER site_records_status_history
  AFTER INSERT OR UPDATE OF workflow_status ON site_records
  FOR EACH ROW EXECUTE FUNCTION record_site_record_status_change();

CREATE OR REPLACE FUNCTION public.phase4_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER inspector_profiles_touch_updated_at
  BEFORE UPDATE ON inspector_profiles
  FOR EACH ROW EXECUTE FUNCTION phase4_touch_updated_at();
CREATE TRIGGER smarts_report_records_touch_updated_at
  BEFORE UPDATE ON smarts_report_records
  FOR EACH ROW EXECUTE FUNCTION phase4_touch_updated_at();
CREATE TRIGGER drainage_areas_touch_updated_at
  BEFORE UPDATE ON drainage_areas
  FOR EACH ROW EXECUTE FUNCTION phase4_touch_updated_at();

-- Trigger functions are internal implementation details, not RPC endpoints.
REVOKE ALL ON FUNCTION public.enforce_site_record_subtype()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_site_record_identity()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_site_record_status_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase4_touch_updated_at()
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 9. Row-level security
-- ============================================================
ALTER TABLE inspector_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_inspector_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_record_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_record_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_record_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarts_report_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarts_payload_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drainage_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarts_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_record_status_history ENABLE ROW LEVEL SECURITY;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.auth_user_can_manage_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_memberships
    WHERE user_id = (SELECT auth.uid())
      AND org_id = p_org_id
      AND role IN ('owner', 'admin', 'qsp')
  );
$$;

REVOKE ALL ON FUNCTION private.auth_user_can_manage_org(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.auth_user_can_manage_org(UUID)
  TO authenticated, service_role;

-- Centralize ownership checks for child tables. Inspectors can mutate only
-- records they own; company owner/admin/QSP roles may manage records for the
-- company. The explicit auth.uid() predicate is required because this helper
-- runs as SECURITY DEFINER to avoid recursive RLS lookups.
CREATE OR REPLACE FUNCTION private.auth_user_can_write_site_record(
  p_site_record_id UUID,
  p_project_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.site_records record
      WHERE record.id = p_site_record_id
        AND record.project_id = p_project_id
        AND (
          record.inspector_user_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.org_memberships membership
            WHERE membership.user_id = (SELECT auth.uid())
              AND membership.org_id = record.org_id
              AND membership.role IN ('owner', 'admin', 'qsp')
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION private.auth_user_can_write_site_record(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.auth_user_can_write_site_record(UUID, TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.auth_user_can_manage_project(
  p_project_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      JOIN public.org_memberships membership
        ON membership.org_id = project.org_id
      WHERE project.id = p_project_id
        AND membership.user_id = (SELECT auth.uid())
        AND membership.role IN ('owner', 'admin', 'qsp')
    );
$$;

REVOKE ALL ON FUNCTION private.auth_user_can_manage_project(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.auth_user_can_manage_project(TEXT)
  TO authenticated, service_role;

CREATE POLICY inspector_profiles_select ON inspector_profiles FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT auth_user_org_ids()));
CREATE POLICY inspector_profiles_insert ON inspector_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (SELECT auth_user_org_ids()) AND
    (user_id = (SELECT auth.uid()) OR private.auth_user_can_manage_org(org_id))
  );
CREATE POLICY inspector_profiles_update ON inspector_profiles FOR UPDATE
  TO authenticated
  USING (
    org_id IN (SELECT auth_user_org_ids()) AND
    (user_id = (SELECT auth.uid()) OR private.auth_user_can_manage_org(org_id))
  )
  WITH CHECK (
    org_id IN (SELECT auth_user_org_ids()) AND
    (user_id = (SELECT auth.uid()) OR private.auth_user_can_manage_org(org_id))
  );

CREATE POLICY project_inspector_assignments_select
  ON project_inspector_assignments FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY project_inspector_assignments_insert
  ON project_inspector_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (SELECT auth_user_project_ids()) AND
    private.auth_user_can_manage_org(org_id)
  );
CREATE POLICY project_inspector_assignments_update
  ON project_inspector_assignments FOR UPDATE
  TO authenticated
  USING (
    project_id IN (SELECT auth_user_project_ids()) AND
    private.auth_user_can_manage_org(org_id)
  )
  WITH CHECK (
    project_id IN (SELECT auth_user_project_ids()) AND
    private.auth_user_can_manage_org(org_id)
  );
CREATE POLICY project_inspector_assignments_delete
  ON project_inspector_assignments FOR DELETE
  TO authenticated
  USING (
    project_id IN (SELECT auth_user_project_ids()) AND
    private.auth_user_can_manage_org(org_id)
  );

CREATE POLICY site_records_select ON site_records FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY site_records_insert ON site_records FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (SELECT auth_user_project_ids())
    AND inspector_user_id = (SELECT auth.uid())
    AND created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM project_inspector_assignments assignment
      WHERE assignment.org_id = site_records.org_id
        AND assignment.project_id = site_records.project_id
        AND assignment.inspector_user_id = (SELECT auth.uid())
        AND assignment.status = 'active'
        AND (assignment.ended_at IS NULL OR assignment.ended_at > NOW())
    )
    AND EXISTS (
      SELECT 1
      FROM inspector_profiles inspector
      WHERE inspector.org_id = site_records.org_id
        AND inspector.user_id = (SELECT auth.uid())
        AND inspector.status = 'active'
    )
  );
CREATE POLICY site_records_update ON site_records FOR UPDATE
  TO authenticated
  USING (private.auth_user_can_write_site_record(id, project_id))
  WITH CHECK (private.auth_user_can_write_site_record(id, project_id));

CREATE POLICY site_record_inspections_select
  ON site_record_inspections FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY site_record_inspections_insert
  ON site_record_inspections FOR INSERT
  TO authenticated
  WITH CHECK (
    private.auth_user_can_write_site_record(site_record_id, project_id)
  );

CREATE POLICY site_record_uploads_select ON site_record_uploads FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY site_record_uploads_insert ON site_record_uploads FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND private.auth_user_can_write_site_record(site_record_id, project_id)
  );

CREATE POLICY site_record_sources_select ON site_record_sources FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY site_record_sources_insert ON site_record_sources FOR INSERT
  TO authenticated
  WITH CHECK (
    captured_by = (SELECT auth.uid())
    AND private.auth_user_can_write_site_record(site_record_id, project_id)
  );

CREATE POLICY smarts_report_records_select ON smarts_report_records FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY smarts_report_records_insert ON smarts_report_records FOR INSERT
  TO authenticated
  WITH CHECK (
    private.auth_user_can_write_site_record(site_record_id, project_id)
  );
CREATE POLICY smarts_report_records_update ON smarts_report_records FOR UPDATE
  TO authenticated
  USING (
    private.auth_user_can_write_site_record(site_record_id, project_id)
  )
  WITH CHECK (
    private.auth_user_can_write_site_record(site_record_id, project_id)
  );

-- Payload versions are append-only to authenticated users.
CREATE POLICY smarts_payload_versions_select
  ON smarts_payload_versions FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY smarts_payload_versions_insert
  ON smarts_payload_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND private.auth_user_can_write_site_record(site_record_id, project_id)
  );

CREATE POLICY drainage_areas_select ON drainage_areas FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY drainage_areas_insert ON drainage_areas FOR INSERT
  TO authenticated
  WITH CHECK (private.auth_user_can_manage_project(project_id));
CREATE POLICY drainage_areas_update ON drainage_areas FOR UPDATE
  TO authenticated
  USING (private.auth_user_can_manage_project(project_id))
  WITH CHECK (private.auth_user_can_manage_project(project_id));
CREATE POLICY drainage_areas_delete ON drainage_areas FOR DELETE
  TO authenticated
  USING (private.auth_user_can_manage_project(project_id));

CREATE POLICY smarts_attachments_select ON smarts_attachments FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY smarts_attachments_insert ON smarts_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    private.auth_user_can_write_site_record(site_record_id, project_id)
  );
CREATE POLICY smarts_attachments_update ON smarts_attachments FOR UPDATE
  TO authenticated
  USING (
    private.auth_user_can_write_site_record(site_record_id, project_id)
  )
  WITH CHECK (
    private.auth_user_can_write_site_record(site_record_id, project_id)
  );

-- Status history is append-only to ordinary users.
CREATE POLICY site_record_status_history_select
  ON site_record_status_history FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT auth_user_project_ids()));

-- The live project grants broad table privileges by default. Make the new
-- Data API surface explicit and keep anonymous sessions out entirely. RLS is
-- still the row-level authority for every authenticated grant below.
REVOKE ALL ON TABLE
  inspector_profiles,
  project_inspector_assignments,
  site_records,
  site_record_inspections,
  site_record_uploads,
  site_record_sources,
  smarts_report_records,
  smarts_payload_versions,
  drainage_areas,
  smarts_attachments,
  site_record_status_history
FROM anon;

GRANT SELECT, INSERT, UPDATE ON TABLE inspector_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  project_inspector_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE site_records TO authenticated;
GRANT SELECT, INSERT ON TABLE site_record_inspections TO authenticated;
GRANT SELECT, INSERT ON TABLE site_record_uploads TO authenticated;
GRANT SELECT, INSERT ON TABLE site_record_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE smarts_report_records TO authenticated;
GRANT SELECT, INSERT ON TABLE smarts_payload_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE drainage_areas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE smarts_attachments TO authenticated;
GRANT SELECT ON TABLE site_record_status_history TO authenticated;

GRANT ALL ON TABLE
  inspector_profiles,
  project_inspector_assignments,
  site_records,
  site_record_inspections,
  site_record_uploads,
  site_record_sources,
  smarts_report_records,
  smarts_payload_versions,
  drainage_areas,
  smarts_attachments,
  site_record_status_history
TO service_role;
GRANT USAGE, SELECT ON SEQUENCE site_record_status_history_id_seq
  TO service_role;
