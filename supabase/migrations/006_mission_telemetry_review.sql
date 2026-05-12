-- Migration 006: Mission Telemetry Replay & AI Review (Block 4)
--
-- Closes the loop on the mission lifecycle (plan -> fly -> review):
--   1. drone_missions gains an append-only actual_flight_path JSONB column
--      that captures every telemetry sample emitted during the flight, plus
--      completed_at / total_flight_seconds timestamps for the deviation panel.
--   2. waypoints gains actual_lat/lng/altitude/captured_at and a photos JSONB
--      array (multi-photo per waypoint). The legacy single-`photo` column is
--      preserved for back-compat; new writes target `photos` and mirror the
--      latest URL into `photo` for older readers.
--   3. mission_ai_analyses — one row per (mission_id, waypoint_number) holding
--      the persisted Claude vision analysis of a captured photo.
--   4. mission_qsp_reviews — one row per (mission_id, waypoint_number) holding
--      the persisted QSP accept/override decision and notes that today live
--      only in-memory in useDroneStore.
--
-- Storage prerequisite (manual, run once per environment):
--   Supabase Storage bucket `mission-photos` with the path convention
--   `{projectId}/{missionId}/{waypointNumber}-{captureIndex}.jpg`.
--   RLS: public read for the demo, service role for writes.
--
-- All endpoints fall back to mock-mode when Supabase is unreachable so the
-- demo project keeps working with this migration unapplied.

-- ============================================================
-- drone_missions: actual telemetry track + completion fields
-- ============================================================
ALTER TABLE drone_missions
  ADD COLUMN IF NOT EXISTS actual_flight_path JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_flight_seconds INTEGER;

-- ============================================================
-- waypoints: per-instance captured-position + multi-photo support
-- ============================================================
-- NOTE: legacy `photo TEXT` column is kept for back-compat. New writes go to
-- `photos JSONB` (array of URLs); the legacy column mirrors photos[last] so
-- older readers continue to work.
ALTER TABLE waypoints
  ADD COLUMN IF NOT EXISTS actual_lat DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS actual_lng DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS actual_altitude DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;

-- ============================================================
-- mission_ai_analyses
-- One persisted Claude vision analysis per mission/waypoint pair.
-- ============================================================
CREATE TABLE IF NOT EXISTS mission_ai_analyses (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES drone_missions(id) ON DELETE CASCADE,
  waypoint_number INTEGER NOT NULL,
  checkpoint_id TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  cgp_reference TEXT NOT NULL DEFAULT '',
  recommendations JSONB DEFAULT '[]'::jsonb,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mission_id, waypoint_number)
);
CREATE INDEX IF NOT EXISTS idx_mission_ai_analyses_mission ON mission_ai_analyses(mission_id);

-- ============================================================
-- mission_qsp_reviews
-- Persisted accept/override/notes from ReviewPanel.
-- ============================================================
CREATE TABLE IF NOT EXISTS mission_qsp_reviews (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES drone_missions(id) ON DELETE CASCADE,
  waypoint_number INTEGER NOT NULL,
  checkpoint_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('accept', 'override', 'pending')),
  override_status TEXT,
  override_notes TEXT,
  ai_analysis_id TEXT REFERENCES mission_ai_analyses(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mission_id, waypoint_number)
);
CREATE INDEX IF NOT EXISTS idx_mission_qsp_reviews_mission ON mission_qsp_reviews(mission_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE mission_ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_qsp_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on mission_ai_analyses" ON mission_ai_analyses;
CREATE POLICY "Allow all on mission_ai_analyses" ON mission_ai_analyses FOR ALL USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Allow all on mission_qsp_reviews" ON mission_qsp_reviews;
CREATE POLICY "Allow all on mission_qsp_reviews" ON mission_qsp_reviews FOR ALL USING (TRUE) WITH CHECK (TRUE);
