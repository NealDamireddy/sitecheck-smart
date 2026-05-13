-- ============================================
-- Migration 009: SMARTS Ad Hoc Monitoring Workflow
-- ============================================
-- Adds the persistence layer for the weather-triggered SMARTS reporting
-- flow. Distinct from the existing in-memory rain-event detector (see
-- src/lib/rain-event-detector.ts) — that flow stays untouched and keeps
-- powering the legacy dashboard banner. This migration introduces:
--
--   * smarts_events         — compliance-grade rain event records
--                              (forecast → active → ended → completed)
--   * monitoring_locations  — predefined sampling points per project
--   * samples               — one sample per (smarts_event, location)
--   * parameter_results     — pH / Turbidity rows attached to a sample
--
-- The existing `inspections.trigger_event_id` column does double duty:
--   * legacy detector ids: `rain-{YYYY-MM-DD}` (no FK, derived)
--   * smarts events:       smarts_events.id (also no FK — same column)
-- Intentional: no schema constraint on trigger_event_id to keep both
-- flows working. Cross-reference is enforced at the API layer.
--
-- All four tables carry a project_id and use the org-scoped RLS pattern
-- established in migration 008 (auth_user_project_ids() helper).
-- ============================================

-- ============================================
-- 1. SMARTS_EVENTS — compliance-grade rain event records
-- ============================================
CREATE TABLE IF NOT EXISTS smarts_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'forecast'
    CHECK (status IN ('forecast', 'active', 'ended', 'completed')),
  source TEXT NOT NULL DEFAULT 'noaa'
    CHECK (source IN ('noaa', 'simulated')),
  forecast_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  precipitation_inches NUMERIC(6, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smarts_events_project_status
  ON smarts_events(project_id, status);

CREATE INDEX IF NOT EXISTS idx_smarts_events_project_detected
  ON smarts_events(project_id, forecast_detected_at DESC);

-- ============================================
-- 2. MONITORING_LOCATIONS — predefined sampling points
-- ============================================
CREATE TABLE IF NOT EXISTS monitoring_locations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  drainage_area TEXT,
  discharge_point_type TEXT,
  is_ats BOOLEAN NOT NULL DEFAULT FALSE,
  is_passive_treatment BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_locations_project
  ON monitoring_locations(project_id)
  WHERE status = 'active';

-- ============================================
-- 3. SAMPLES — one row per location per smarts_event
-- ============================================
-- project_id is intentionally denormalized (also reachable via
-- smarts_event_id → smarts_events.project_id and via
-- monitoring_location_id → monitoring_locations.project_id) so RLS
-- policies can use the cheap project_id IN (...) form without a join.
CREATE TABLE IF NOT EXISTS samples (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  smarts_event_id TEXT NOT NULL REFERENCES smarts_events(id) ON DELETE CASCADE,
  monitoring_location_id TEXT NOT NULL REFERENCES monitoring_locations(id) ON DELETE CASCADE,
  sample_datetime TIMESTAMPTZ NOT NULL,
  qsp_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (smarts_event_id, monitoring_location_id)
);

CREATE INDEX IF NOT EXISTS idx_samples_event
  ON samples(smarts_event_id);

CREATE INDEX IF NOT EXISTS idx_samples_location
  ON samples(monitoring_location_id);

CREATE INDEX IF NOT EXISTS idx_samples_project
  ON samples(project_id);

-- ============================================
-- 4. PARAMETER_RESULTS — pH / Turbidity rows per sample
-- ============================================
-- project_id again denormalized for cheap RLS.
-- result is nullable when qualifier is 'ND' (non-detect) or 'DNQ'
-- (detected, not quantified).
CREATE TABLE IF NOT EXISTS parameter_results (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  parameter TEXT NOT NULL
    CHECK (parameter IN ('pH', 'Turbidity')),
  qualifier TEXT NOT NULL DEFAULT '='
    CHECK (qualifier IN ('=', 'ND', 'DNQ')),
  result NUMERIC(10, 3),
  units TEXT NOT NULL,
  analytical_method TEXT NOT NULL,
  mdl NUMERIC(10, 3),
  rl NUMERIC(10, 3),
  analyzed_by TEXT NOT NULL DEFAULT 'Self'
    CHECK (analyzed_by IN ('Self', 'Lab')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sample_id, parameter)
);

CREATE INDEX IF NOT EXISTS idx_parameter_results_sample
  ON parameter_results(sample_id);

-- ============================================
-- 5. updated_at triggers (match the migration 007 pattern)
-- ============================================
CREATE OR REPLACE FUNCTION smarts_events_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_smarts_events_updated_at ON smarts_events;
CREATE TRIGGER trg_smarts_events_updated_at
  BEFORE UPDATE ON smarts_events
  FOR EACH ROW
  EXECUTE FUNCTION smarts_events_set_updated_at();

CREATE OR REPLACE FUNCTION monitoring_locations_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monitoring_locations_updated_at ON monitoring_locations;
CREATE TRIGGER trg_monitoring_locations_updated_at
  BEFORE UPDATE ON monitoring_locations
  FOR EACH ROW
  EXECUTE FUNCTION monitoring_locations_set_updated_at();

CREATE OR REPLACE FUNCTION samples_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_samples_updated_at ON samples;
CREATE TRIGGER trg_samples_updated_at
  BEFORE UPDATE ON samples
  FOR EACH ROW
  EXECUTE FUNCTION samples_set_updated_at();

CREATE OR REPLACE FUNCTION parameter_results_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parameter_results_updated_at ON parameter_results;
CREATE TRIGGER trg_parameter_results_updated_at
  BEFORE UPDATE ON parameter_results
  FOR EACH ROW
  EXECUTE FUNCTION parameter_results_set_updated_at();

-- ============================================
-- 6. Row-Level Security — org-scoped via project_id
-- ============================================
-- Matches the migration 008 pattern: every table uses
-- project_id IN (SELECT auth_user_project_ids()).
ALTER TABLE smarts_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE parameter_results ENABLE ROW LEVEL SECURITY;

-- smarts_events
CREATE POLICY "smarts_events_select" ON smarts_events FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "smarts_events_insert" ON smarts_events FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "smarts_events_update" ON smarts_events FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "smarts_events_delete" ON smarts_events FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- monitoring_locations
CREATE POLICY "monitoring_locations_select" ON monitoring_locations FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "monitoring_locations_insert" ON monitoring_locations FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "monitoring_locations_update" ON monitoring_locations FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "monitoring_locations_delete" ON monitoring_locations FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- samples
CREATE POLICY "samples_select" ON samples FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "samples_insert" ON samples FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "samples_update" ON samples FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "samples_delete" ON samples FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- parameter_results
CREATE POLICY "parameter_results_select" ON parameter_results FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "parameter_results_insert" ON parameter_results FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "parameter_results_update" ON parameter_results FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "parameter_results_delete" ON parameter_results FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));
