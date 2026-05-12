-- ============================================
-- Migration 008: Auth & Row-Level Security
-- ============================================
-- Creates organizations + org_memberships tables,
-- adds org_id to projects, and replaces all
-- permissive RLS policies with org-scoped ones.
-- ============================================

-- 1. Create organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- 2. Create org_memberships table (links auth.users → organizations)
CREATE TABLE org_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'qsp', 'inspector', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, org_id)
);

CREATE INDEX idx_org_memberships_user ON org_memberships(user_id);
CREATE INDEX idx_org_memberships_org ON org_memberships(org_id);

ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;

-- 3. Add org_id to projects
ALTER TABLE projects ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_projects_org ON projects(org_id);

-- 4. Backfill: create a default org and assign all existing projects
DO $$
DECLARE
  default_org_id UUID;
BEGIN
  INSERT INTO organizations (name, slug, plan)
  VALUES ('Default Organization', 'default-org', 'pro')
  RETURNING id INTO default_org_id;

  UPDATE projects SET org_id = default_org_id WHERE org_id IS NULL;
END $$;

-- Make org_id NOT NULL after backfill
ALTER TABLE projects ALTER COLUMN org_id SET NOT NULL;

-- ============================================
-- 5. Helper function for RLS — returns org IDs the current user belongs to
-- ============================================
CREATE OR REPLACE FUNCTION auth_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM org_memberships WHERE user_id = auth.uid();
$$;

-- Helper: returns project IDs accessible to current user
CREATE OR REPLACE FUNCTION auth_user_project_ids()
RETURNS SETOF TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM projects WHERE org_id IN (SELECT auth_user_org_ids());
$$;

-- ============================================
-- 6. Drop ALL permissive policies
-- ============================================
-- Migration 001 tables
DROP POLICY IF EXISTS "Allow all on projects" ON projects;
DROP POLICY IF EXISTS "Allow all on checkpoints" ON checkpoints;
DROP POLICY IF EXISTS "Allow all on drone_missions" ON drone_missions;
DROP POLICY IF EXISTS "Allow all on inspections" ON inspections;
DROP POLICY IF EXISTS "Allow all on inspection_findings" ON inspection_findings;
DROP POLICY IF EXISTS "Allow all on ai_analyses" ON ai_analyses;
DROP POLICY IF EXISTS "Allow all on deficiencies" ON deficiencies;
DROP POLICY IF EXISTS "Allow all on waypoints" ON waypoints;
DROP POLICY IF EXISTS "Allow all on weather_snapshots" ON weather_snapshots;
DROP POLICY IF EXISTS "Allow all on weather_forecasts" ON weather_forecasts;
DROP POLICY IF EXISTS "Allow all on qp_events" ON qp_events;
DROP POLICY IF EXISTS "Allow all on activity_events" ON activity_events;
DROP POLICY IF EXISTS "Allow all on notifications" ON notifications;
DROP POLICY IF EXISTS "Allow all on reports" ON reports;

-- Migration 003
DROP POLICY IF EXISTS "Allow all on project_segments" ON project_segments;

-- Migration 004
DROP POLICY IF EXISTS "Allow all on crossings" ON crossings;
DROP POLICY IF EXISTS "Allow all on segment_permits" ON segment_permits;

-- Migration 005
DROP POLICY IF EXISTS "Allow all on geofences" ON geofences;
DROP POLICY IF EXISTS "Allow all on nofly_zones" ON nofly_zones;

-- Migration 006
DROP POLICY IF EXISTS "Allow all on mission_ai_analyses" ON mission_ai_analyses;
DROP POLICY IF EXISTS "Allow all on mission_qsp_reviews" ON mission_qsp_reviews;

-- Migration 007
DROP POLICY IF EXISTS "Allow all on inspection_missions" ON inspection_missions;
DROP POLICY IF EXISTS "Allow all on corrective_actions" ON corrective_actions;

-- ============================================
-- 7. Create org-scoped RLS policies
-- ============================================

-- Organizations: members can read their own orgs
CREATE POLICY "org_select" ON organizations FOR SELECT
  USING (id IN (SELECT auth_user_org_ids()));
CREATE POLICY "org_update" ON organizations FOR UPDATE
  USING (id IN (SELECT auth_user_org_ids()));

-- Org memberships: members can see other members of their orgs
CREATE POLICY "membership_select" ON org_memberships FOR SELECT
  USING (org_id IN (SELECT auth_user_org_ids()));
CREATE POLICY "membership_insert" ON org_memberships FOR INSERT
  WITH CHECK (org_id IN (SELECT auth_user_org_ids()));
CREATE POLICY "membership_delete" ON org_memberships FOR DELETE
  USING (org_id IN (SELECT auth_user_org_ids()));

-- Projects: scoped by org_id
CREATE POLICY "projects_select" ON projects FOR SELECT
  USING (org_id IN (SELECT auth_user_org_ids()));
CREATE POLICY "projects_insert" ON projects FOR INSERT
  WITH CHECK (org_id IN (SELECT auth_user_org_ids()));
CREATE POLICY "projects_update" ON projects FOR UPDATE
  USING (org_id IN (SELECT auth_user_org_ids()));
CREATE POLICY "projects_delete" ON projects FOR DELETE
  USING (org_id IN (SELECT auth_user_org_ids()));

-- All project-child tables: scoped via project_id → projects → org_id
-- Using the helper function for performance

-- Checkpoints
CREATE POLICY "checkpoints_select" ON checkpoints FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "checkpoints_insert" ON checkpoints FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "checkpoints_update" ON checkpoints FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "checkpoints_delete" ON checkpoints FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- Drone missions
CREATE POLICY "drone_missions_select" ON drone_missions FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "drone_missions_insert" ON drone_missions FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "drone_missions_update" ON drone_missions FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "drone_missions_delete" ON drone_missions FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- Inspections
CREATE POLICY "inspections_select" ON inspections FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "inspections_insert" ON inspections FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "inspections_update" ON inspections FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "inspections_delete" ON inspections FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- Inspection findings (via inspection → project)
CREATE POLICY "inspection_findings_select" ON inspection_findings FOR SELECT
  USING (inspection_id IN (SELECT id FROM inspections WHERE project_id IN (SELECT auth_user_project_ids())));
CREATE POLICY "inspection_findings_insert" ON inspection_findings FOR INSERT
  WITH CHECK (inspection_id IN (SELECT id FROM inspections WHERE project_id IN (SELECT auth_user_project_ids())));
CREATE POLICY "inspection_findings_update" ON inspection_findings FOR UPDATE
  USING (inspection_id IN (SELECT id FROM inspections WHERE project_id IN (SELECT auth_user_project_ids())));
CREATE POLICY "inspection_findings_delete" ON inspection_findings FOR DELETE
  USING (inspection_id IN (SELECT id FROM inspections WHERE project_id IN (SELECT auth_user_project_ids())));

-- AI analyses (via checkpoint → project)
CREATE POLICY "ai_analyses_select" ON ai_analyses FOR SELECT
  USING (checkpoint_id IN (SELECT id FROM checkpoints WHERE project_id IN (SELECT auth_user_project_ids())));
CREATE POLICY "ai_analyses_insert" ON ai_analyses FOR INSERT
  WITH CHECK (checkpoint_id IN (SELECT id FROM checkpoints WHERE project_id IN (SELECT auth_user_project_ids())));
CREATE POLICY "ai_analyses_update" ON ai_analyses FOR UPDATE
  USING (checkpoint_id IN (SELECT id FROM checkpoints WHERE project_id IN (SELECT auth_user_project_ids())));

-- Deficiencies
CREATE POLICY "deficiencies_select" ON deficiencies FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "deficiencies_insert" ON deficiencies FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "deficiencies_update" ON deficiencies FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "deficiencies_delete" ON deficiencies FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- Waypoints (via mission → project)
CREATE POLICY "waypoints_select" ON waypoints FOR SELECT
  USING (mission_id IN (SELECT id FROM drone_missions WHERE project_id IN (SELECT auth_user_project_ids())));
CREATE POLICY "waypoints_insert" ON waypoints FOR INSERT
  WITH CHECK (mission_id IN (SELECT id FROM drone_missions WHERE project_id IN (SELECT auth_user_project_ids())));
CREATE POLICY "waypoints_update" ON waypoints FOR UPDATE
  USING (mission_id IN (SELECT id FROM drone_missions WHERE project_id IN (SELECT auth_user_project_ids())));
CREATE POLICY "waypoints_delete" ON waypoints FOR DELETE
  USING (mission_id IN (SELECT id FROM drone_missions WHERE project_id IN (SELECT auth_user_project_ids())));

-- Weather snapshots
CREATE POLICY "weather_snapshots_select" ON weather_snapshots FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "weather_snapshots_insert" ON weather_snapshots FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));

-- Weather forecasts
CREATE POLICY "weather_forecasts_select" ON weather_forecasts FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "weather_forecasts_insert" ON weather_forecasts FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));

-- QP events
CREATE POLICY "qp_events_select" ON qp_events FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "qp_events_insert" ON qp_events FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));

-- Activity events
CREATE POLICY "activity_events_select" ON activity_events FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "activity_events_insert" ON activity_events FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));

-- Notifications
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "notifications_insert" ON notifications FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- Reports
CREATE POLICY "reports_select" ON reports FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "reports_insert" ON reports FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "reports_update" ON reports FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- Project segments
CREATE POLICY "project_segments_select" ON project_segments FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "project_segments_insert" ON project_segments FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "project_segments_update" ON project_segments FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "project_segments_delete" ON project_segments FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- Crossings
CREATE POLICY "crossings_select" ON crossings FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "crossings_insert" ON crossings FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "crossings_update" ON crossings FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "crossings_delete" ON crossings FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- Segment permits
CREATE POLICY "segment_permits_select" ON segment_permits FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "segment_permits_insert" ON segment_permits FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "segment_permits_update" ON segment_permits FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- Geofences (via project_id)
CREATE POLICY "geofences_select" ON geofences FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "geofences_insert" ON geofences FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "geofences_update" ON geofences FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "geofences_delete" ON geofences FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- No-fly zones (via project_id)
CREATE POLICY "nofly_zones_select" ON nofly_zones FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "nofly_zones_insert" ON nofly_zones FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "nofly_zones_update" ON nofly_zones FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "nofly_zones_delete" ON nofly_zones FOR DELETE
  USING (project_id IN (SELECT auth_user_project_ids()));

-- Mission AI analyses (via mission → project)
CREATE POLICY "mission_ai_analyses_select" ON mission_ai_analyses FOR SELECT
  USING (mission_id IN (SELECT id FROM drone_missions WHERE project_id IN (SELECT auth_user_project_ids())));
CREATE POLICY "mission_ai_analyses_insert" ON mission_ai_analyses FOR INSERT
  WITH CHECK (mission_id IN (SELECT id FROM drone_missions WHERE project_id IN (SELECT auth_user_project_ids())));

-- Mission QSP reviews (via mission → project)
CREATE POLICY "mission_qsp_reviews_select" ON mission_qsp_reviews FOR SELECT
  USING (mission_id IN (SELECT id FROM drone_missions WHERE project_id IN (SELECT auth_user_project_ids())));
CREATE POLICY "mission_qsp_reviews_insert" ON mission_qsp_reviews FOR INSERT
  WITH CHECK (mission_id IN (SELECT id FROM drone_missions WHERE project_id IN (SELECT auth_user_project_ids())));

-- Inspection missions (via inspection → project)
CREATE POLICY "inspection_missions_select" ON inspection_missions FOR SELECT
  USING (inspection_id IN (SELECT id FROM inspections WHERE project_id IN (SELECT auth_user_project_ids())));
CREATE POLICY "inspection_missions_insert" ON inspection_missions FOR INSERT
  WITH CHECK (inspection_id IN (SELECT id FROM inspections WHERE project_id IN (SELECT auth_user_project_ids())));
CREATE POLICY "inspection_missions_delete" ON inspection_missions FOR DELETE
  USING (inspection_id IN (SELECT id FROM inspections WHERE project_id IN (SELECT auth_user_project_ids())));

-- Corrective actions
CREATE POLICY "corrective_actions_select" ON corrective_actions FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "corrective_actions_insert" ON corrective_actions FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));
CREATE POLICY "corrective_actions_update" ON corrective_actions FOR UPDATE
  USING (project_id IN (SELECT auth_user_project_ids()));
