-- SiteCheck Database Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. PROJECTS
-- ============================================
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  permit_number TEXT NOT NULL,
  wdid TEXT NOT NULL,
  risk_level INTEGER NOT NULL CHECK (risk_level IN (1, 2, 3)),
  qsp_name TEXT NOT NULL,
  qsp_license_number TEXT NOT NULL,
  qsp_company TEXT NOT NULL,
  qsp_phone TEXT NOT NULL,
  qsp_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  start_date DATE NOT NULL,
  estimated_completion DATE NOT NULL,
  acreage DECIMAL(10, 2) NOT NULL,
  center_lat DECIMAL(10, 6) NOT NULL,
  center_lng DECIMAL(10, 6) NOT NULL,
  bounds_sw_lat DECIMAL(10, 6),
  bounds_sw_lng DECIMAL(10, 6),
  bounds_ne_lat DECIMAL(10, 6),
  bounds_ne_lng DECIMAL(10, 6),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. CHECKPOINTS
-- ============================================
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bmp_type TEXT NOT NULL CHECK (bmp_type IN (
    'erosion-control', 'sediment-control', 'tracking-control',
    'wind-erosion', 'materials-management', 'non-storm-water'
  )),
  status TEXT NOT NULL CHECK (status IN ('compliant', 'deficient', 'needs-review')),
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  zone TEXT NOT NULL CHECK (zone IN ('north', 'south', 'east', 'west', 'central')),
  description TEXT NOT NULL,
  cgp_section TEXT NOT NULL,
  lat DECIMAL(10, 6) NOT NULL,
  lng DECIMAL(10, 6) NOT NULL,
  last_inspection_date TIMESTAMPTZ,
  last_inspection_photo TEXT,
  previous_photo TEXT,
  install_date DATE NOT NULL,
  swppp_page INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_checkpoints_project ON checkpoints(project_id);
CREATE INDEX idx_checkpoints_status ON checkpoints(status);
CREATE INDEX idx_checkpoints_bmp_type ON checkpoints(bmp_type);

-- ============================================
-- 3. DRONE MISSIONS
-- ============================================
CREATE TABLE drone_missions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'in-progress', 'completed')),
  date DATE NOT NULL,
  inspection_type TEXT NOT NULL CHECK (inspection_type IN ('routine', 'pre-storm', 'post-storm', 'qpe')),
  flight_time_minutes INTEGER NOT NULL DEFAULT 0,
  altitude INTEGER NOT NULL DEFAULT 120,
  battery_start INTEGER NOT NULL DEFAULT 100,
  battery_end INTEGER NOT NULL DEFAULT 0,
  weather_temperature INTEGER,
  weather_condition TEXT,
  weather_wind_speed_mph INTEGER,
  weather_humidity INTEGER,
  flight_path JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drone_missions_project ON drone_missions(project_id);
CREATE INDEX idx_drone_missions_status ON drone_missions(status);

-- ============================================
-- 4. INSPECTIONS
-- ============================================
CREATE TABLE inspections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('routine', 'pre-storm', 'post-storm', 'qpe')),
  inspector TEXT NOT NULL,
  weather_temperature INTEGER NOT NULL DEFAULT 0,
  weather_condition TEXT NOT NULL DEFAULT 'clear',
  weather_wind_speed_mph INTEGER NOT NULL DEFAULT 0,
  weather_humidity INTEGER NOT NULL DEFAULT 0,
  overall_compliance INTEGER NOT NULL CHECK (overall_compliance >= 0 AND overall_compliance <= 100),
  mission_id TEXT REFERENCES drone_missions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inspections_project ON inspections(project_id);
CREATE INDEX idx_inspections_date ON inspections(date);

-- ============================================
-- 5. INSPECTION FINDINGS
-- ============================================
CREATE TABLE inspection_findings (
  id SERIAL PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('compliant', 'deficient', 'needs-review')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inspection_findings_inspection ON inspection_findings(inspection_id);
CREATE INDEX idx_inspection_findings_checkpoint ON inspection_findings(checkpoint_id);

-- ============================================
-- 6. AI ANALYSES
-- ============================================
CREATE TABLE ai_analyses (
  id SERIAL PRIMARY KEY,
  checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('compliant', 'deficient', 'needs-review')),
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  details JSONB NOT NULL DEFAULT '[]',
  cgp_reference TEXT NOT NULL DEFAULT '',
  recommendations JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_analyses_checkpoint ON ai_analyses(checkpoint_id);

-- ============================================
-- 7. DEFICIENCIES
-- ============================================
CREATE TABLE deficiencies (
  id TEXT PRIMARY KEY,
  checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  detected_date TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  cgp_violation TEXT NOT NULL,
  corrective_action TEXT NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'in-progress', 'resolved')),
  resolved_date TIMESTAMPTZ,
  resolved_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deficiencies_checkpoint ON deficiencies(checkpoint_id);
CREATE INDEX idx_deficiencies_project ON deficiencies(project_id);
CREATE INDEX idx_deficiencies_status ON deficiencies(status);

-- ============================================
-- 8. WAYPOINTS
-- ============================================
CREATE TABLE waypoints (
  id SERIAL PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES drone_missions(id) ON DELETE CASCADE,
  checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  lat DECIMAL(10, 6) NOT NULL,
  lng DECIMAL(10, 6) NOT NULL,
  capture_status TEXT NOT NULL CHECK (capture_status IN ('captured', 'missed', 'pending')),
  arrival_time TIMESTAMPTZ NOT NULL,
  photo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_waypoints_mission ON waypoints(mission_id);
CREATE INDEX idx_waypoints_checkpoint ON waypoints(checkpoint_id);

-- ============================================
-- 9. WEATHER SNAPSHOTS (cache)
-- ============================================
CREATE TABLE weather_snapshots (
  id SERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  temperature INTEGER NOT NULL,
  condition TEXT NOT NULL,
  wind_speed_mph INTEGER NOT NULL,
  humidity INTEGER NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id)
);

-- ============================================
-- 10. WEATHER FORECASTS (cache)
-- ============================================
CREATE TABLE weather_forecasts (
  id SERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  high INTEGER NOT NULL,
  low INTEGER NOT NULL,
  precipitation_inches DECIMAL(4, 2) NOT NULL DEFAULT 0,
  precipitation_chance INTEGER NOT NULL DEFAULT 0,
  wind_speed_mph INTEGER NOT NULL,
  wind_direction TEXT NOT NULL DEFAULT 'N',
  condition TEXT NOT NULL,
  humidity INTEGER NOT NULL,
  is_qpe BOOLEAN NOT NULL DEFAULT FALSE,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, date)
);

CREATE INDEX idx_weather_forecasts_project ON weather_forecasts(project_id);

-- ============================================
-- 11. QP EVENTS
-- ============================================
CREATE TABLE qp_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  total_precipitation DECIMAL(4, 2) NOT NULL,
  inspection_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  inspection_id TEXT REFERENCES inspections(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_qp_events_project ON qp_events(project_id);

-- ============================================
-- 12. ACTIVITY EVENTS
-- ============================================
CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('drone', 'inspection', 'alert', 'weather', 'document', 'deficiency')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  severity TEXT CHECK (severity IN ('info', 'warning', 'critical')),
  linked_entity_id TEXT,
  linked_entity_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_events_project ON activity_events(project_id);
CREATE INDEX idx_activity_events_timestamp ON activity_events(timestamp DESC);

-- ============================================
-- 13. NOTIFICATIONS
-- ============================================
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('alert', 'warning', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_project ON notifications(project_id);
CREATE INDEX idx_notifications_read ON notifications(read);

-- ============================================
-- 14. REPORTS
-- ============================================
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  inspection_id TEXT REFERENCES inspections(id) ON DELETE SET NULL,
  generated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sections JSONB NOT NULL DEFAULT '[]',
  signed BOOLEAN NOT NULL DEFAULT FALSE,
  signed_by TEXT,
  signed_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_project ON reports(project_id);

-- ============================================
-- ENABLE ROW LEVEL SECURITY (permissive for now)
-- ============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE drone_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE deficiencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE waypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE qp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Allow all operations (single-tenant, no auth required)
CREATE POLICY "Allow all on projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on checkpoints" ON checkpoints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on drone_missions" ON drone_missions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on inspections" ON inspections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on inspection_findings" ON inspection_findings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on ai_analyses" ON ai_analyses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on deficiencies" ON deficiencies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on waypoints" ON waypoints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on weather_snapshots" ON weather_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on weather_forecasts" ON weather_forecasts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on qp_events" ON qp_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on activity_events" ON activity_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on reports" ON reports FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- ENABLE REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE activity_events;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE checkpoints;
ALTER PUBLICATION supabase_realtime ADD TABLE deficiencies;
