-- Migration 005: Geofences + No-Fly Zones (Block 3 — Geofence Enforcement)
--
-- Adds two new tables for drone airspace safety:
--   geofences   — allowed-area polygons (one per project, with optional manual overrides)
--   nofly_zones — forbidden-area polygons (many per project, categorized)
--
-- Both are validated at mission planning time. See src/lib/geofence.ts for the
-- pure-JS validation library and src/app/api/{geofences,nofly-zones}/route.ts
-- for the CRUD endpoints (with mock fallback so the demo project keeps working
-- even when this migration has not been applied).

-- ============================================================
-- Geofences
-- ============================================================
CREATE TABLE IF NOT EXISTS geofences (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- [[lng,lat], [lng,lat], ...] closed ring
  polygon JSONB NOT NULL,
  ceiling_feet DECIMAL(8,2),
  floor_feet DECIMAL(8,2),
  source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_geofences_project ON geofences(project_id);

-- ============================================================
-- No-Fly Zones
-- ============================================================
CREATE TABLE IF NOT EXISTS nofly_zones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('airport','school','critical-infra','wildlife','private','temporary')
  ),
  -- [[lng,lat], [lng,lat], ...] closed ring
  polygon JSONB NOT NULL,
  floor_feet DECIMAL(8,2),
  ceiling_feet DECIMAL(8,2),
  description TEXT,
  source TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nofly_zones_project ON nofly_zones(project_id);
CREATE INDEX IF NOT EXISTS idx_nofly_zones_active ON nofly_zones(active) WHERE active = TRUE;

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE nofly_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on geofences" ON geofences;
CREATE POLICY "Allow all on geofences" ON geofences FOR ALL USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Allow all on nofly_zones" ON nofly_zones;
CREATE POLICY "Allow all on nofly_zones" ON nofly_zones FOR ALL USING (TRUE) WITH CHECK (TRUE);
