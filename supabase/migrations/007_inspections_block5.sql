-- ============================================
-- BLOCK 5 — Compliance Reports & Inspection Records
-- ============================================
-- Extends the existing `inspections` table with rain-event triggers,
-- due-by deadlines, narrative summaries, AI/QSP compliance percentages,
-- and a permanent link to a generated `reports` row.
--
-- Adds two new tables:
--   * inspection_missions  — many-to-many between an inspection and the
--                             missions it rolls up
--   * corrective_actions   — audit-trail closure for AI findings (deficient
--                             finding -> corrective action -> resolved with
--                             proof photo)
--
-- All changes are additive. The legacy columns on `inspections`
-- (overall_compliance, mission_id, weather_*, type, inspector) stay
-- intact so the existing report-generation route keeps working.
-- ============================================

-- ============================================
-- 1. EXTEND inspections TABLE
-- ============================================
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS trigger TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger IN ('manual', 'routine', 'rain-event', 'post-storm', 'pre-storm', 'qpe')),
  ADD COLUMN IF NOT EXISTS trigger_event_id TEXT,
  ADD COLUMN IF NOT EXISTS due_by TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in-progress', 'submitted', 'archived')),
  ADD COLUMN IF NOT EXISTS narrative TEXT,
  ADD COLUMN IF NOT EXISTS ai_overall_compliance INTEGER
    CHECK (ai_overall_compliance IS NULL OR (ai_overall_compliance >= 0 AND ai_overall_compliance <= 100)),
  ADD COLUMN IF NOT EXISTS qsp_overall_compliance INTEGER
    CHECK (qsp_overall_compliance IS NULL OR (qsp_overall_compliance >= 0 AND qsp_overall_compliance <= 100)),
  ADD COLUMN IF NOT EXISTS report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index the due-by countdown so the dashboard rain-event banner query is fast
CREATE INDEX IF NOT EXISTS idx_inspections_due_by
  ON inspections(due_by)
  WHERE status IS NULL OR status != 'submitted';

-- Index the trigger so /api/inspections/check-rain-events can dedupe quickly
CREATE INDEX IF NOT EXISTS idx_inspections_trigger
  ON inspections(project_id, trigger);

-- Index trigger_event_id for the rain-event idempotency lookup
CREATE INDEX IF NOT EXISTS idx_inspections_trigger_event
  ON inspections(trigger_event_id)
  WHERE trigger_event_id IS NOT NULL;

-- ============================================
-- 2. INSPECTION_MISSIONS — many-to-many
-- ============================================
-- One inspection can roll up several missions (typical pattern: morning
-- mission + afternoon follow-up after a rain event). One mission can also
-- belong to several inspections over time (e.g., archived audit then a
-- fresh re-review).
CREATE TABLE IF NOT EXISTS inspection_missions (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES drone_missions(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(inspection_id, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_inspection_missions_inspection
  ON inspection_missions(inspection_id);

CREATE INDEX IF NOT EXISTS idx_inspection_missions_mission
  ON inspection_missions(mission_id);

-- ============================================
-- 3. CORRECTIVE_ACTIONS — finding-to-resolution audit trail
-- ============================================
CREATE TABLE IF NOT EXISTS corrective_actions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  inspection_id TEXT REFERENCES inspections(id) ON DELETE SET NULL,
  mission_id TEXT REFERENCES drone_missions(id) ON DELETE SET NULL,
  waypoint_number INTEGER,
  checkpoint_id TEXT,
  source_analysis_id TEXT REFERENCES mission_ai_analyses(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  cgp_reference TEXT,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in-progress', 'resolved', 'verified')),
  due_date TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_photo_url TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrective_actions_project_status
  ON corrective_actions(project_id, status);

CREATE INDEX IF NOT EXISTS idx_corrective_actions_due_date
  ON corrective_actions(due_date)
  WHERE status NOT IN ('resolved', 'verified');

CREATE INDEX IF NOT EXISTS idx_corrective_actions_inspection
  ON corrective_actions(inspection_id)
  WHERE inspection_id IS NOT NULL;

-- ============================================
-- 4. RLS — match the project pattern from earlier migrations
-- ============================================
ALTER TABLE inspection_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrective_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on inspection_missions"
  ON inspection_missions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on corrective_actions"
  ON corrective_actions FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 5. updated_at trigger for corrective_actions
-- ============================================
CREATE OR REPLACE FUNCTION corrective_actions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_corrective_actions_updated_at ON corrective_actions;
CREATE TRIGGER trg_corrective_actions_updated_at
  BEFORE UPDATE ON corrective_actions
  FOR EACH ROW
  EXECUTE FUNCTION corrective_actions_set_updated_at();

-- Same for inspections.updated_at since we just added that column
CREATE OR REPLACE FUNCTION inspections_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inspections_updated_at ON inspections;
CREATE TRIGGER trg_inspections_updated_at
  BEFORE UPDATE ON inspections
  FOR EACH ROW
  EXECUTE FUNCTION inspections_set_updated_at();
