-- ============================================================================
-- Migration 004: Crossings, Right-of-Way (ROW), Segment Permits & Per-Station
-- Inspections for Linear Infrastructure Projects
--
-- Combines Phases 2 (Crossings), 3 (ROW), and 4 (Permits & inspection ranges)
-- of the linear-projects production-readiness work.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Phase 2: Crossings
-- ----------------------------------------------------------------------------

CREATE TABLE crossings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  segment_id TEXT REFERENCES project_segments(id) ON DELETE SET NULL,
  crossing_type TEXT NOT NULL CHECK (crossing_type IN ('stream', 'road', 'utility', 'railroad', 'wetland')),
  name TEXT NOT NULL,
  station_number DECIMAL(12, 2),
  station_label TEXT,
  location JSONB,                          -- [lng, lat]
  description TEXT,
  permits_required TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in-progress', 'completed', 'flagged')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crossings_project ON crossings(project_id);
CREATE INDEX idx_crossings_segment ON crossings(segment_id);

ALTER TABLE crossings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on crossings" ON crossings
  FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Phase 3: Right-of-Way (ROW)
-- ----------------------------------------------------------------------------

ALTER TABLE projects ADD COLUMN row_left_boundary JSONB;     -- [[lng, lat], ...]
ALTER TABLE projects ADD COLUMN row_right_boundary JSONB;    -- [[lng, lat], ...]
ALTER TABLE projects ADD COLUMN row_easement_description TEXT;
ALTER TABLE projects ADD COLUMN row_width_feet DECIMAL(8, 2);

-- ----------------------------------------------------------------------------
-- Phase 4: Segment Permits
-- ----------------------------------------------------------------------------

CREATE TABLE segment_permits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  segment_id TEXT REFERENCES project_segments(id) ON DELETE SET NULL,
  crossing_id TEXT REFERENCES crossings(id) ON DELETE SET NULL,
  permit_type TEXT NOT NULL,        -- '404', '401', 'NPDES-CGP', 'local-encroachment', etc.
  permit_number TEXT,
  agency TEXT,
  issued_date DATE,
  expiration_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired', 'pending', 'revoked')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_segment_permits_project ON segment_permits(project_id);
CREATE INDEX idx_segment_permits_segment ON segment_permits(segment_id);
CREATE INDEX idx_segment_permits_crossing ON segment_permits(crossing_id);
CREATE INDEX idx_segment_permits_expiration ON segment_permits(expiration_date);

ALTER TABLE segment_permits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on segment_permits" ON segment_permits
  FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Phase 4: Per-Station Inspections
-- ----------------------------------------------------------------------------

ALTER TABLE inspections ADD COLUMN segment_id TEXT REFERENCES project_segments(id) ON DELETE SET NULL;
ALTER TABLE inspections ADD COLUMN station_range_start DECIMAL(12, 2);
ALTER TABLE inspections ADD COLUMN station_range_end DECIMAL(12, 2);

CREATE INDEX idx_inspections_segment ON inspections(segment_id);
