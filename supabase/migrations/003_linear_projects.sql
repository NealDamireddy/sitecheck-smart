-- ============================================================================
-- Migration 003: Linear Infrastructure Project Support
-- Adds corridor geometry to projects and linear referencing to checkpoints.
-- ============================================================================

-- Project type discriminator
ALTER TABLE projects
  ADD COLUMN project_type TEXT NOT NULL DEFAULT 'bounded-site'
    CHECK (project_type IN ('bounded-site', 'linear'));

-- Corridor geometry fields (only populated for linear projects)
ALTER TABLE projects ADD COLUMN corridor_centerline JSONB;
ALTER TABLE projects ADD COLUMN corridor_width_feet DECIMAL(10, 2);
ALTER TABLE projects ADD COLUMN corridor_total_length DECIMAL(12, 2);
ALTER TABLE projects ADD COLUMN corridor_linear_unit TEXT DEFAULT 'feet'
  CHECK (corridor_linear_unit IN ('feet', 'miles'));
ALTER TABLE projects ADD COLUMN linear_mileage DECIMAL(10, 2);

-- Project segments (named corridor sections)
CREATE TABLE project_segments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_station DECIMAL(12, 2) NOT NULL,
  end_station DECIMAL(12, 2) NOT NULL,
  centerline_slice JSONB,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_segments_project ON project_segments(project_id);

-- Linear referencing on checkpoints
ALTER TABLE checkpoints ADD COLUMN station_number DECIMAL(12, 2);
ALTER TABLE checkpoints ADD COLUMN station_offset_feet DECIMAL(8, 2) DEFAULT 0;
ALTER TABLE checkpoints ADD COLUMN segment_id TEXT REFERENCES project_segments(id) ON DELETE SET NULL;
ALTER TABLE checkpoints ADD COLUMN station_label TEXT;

-- Allow zone to be NULL for linear projects
ALTER TABLE checkpoints ALTER COLUMN zone DROP NOT NULL;

-- RLS for project_segments
ALTER TABLE project_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on project_segments" ON project_segments
  FOR ALL USING (true) WITH CHECK (true);
