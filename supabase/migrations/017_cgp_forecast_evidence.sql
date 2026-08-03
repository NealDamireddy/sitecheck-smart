-- ============================================
-- Migration 017: Immutable CGP forecast evidence
-- ============================================
-- Adds append-only, project-scoped storage for the exact NWS payload and
-- normalized six-hour periods used by the draft 2022 CGP rules engine.
--
-- Authenticated clients receive SELECT and INSERT policies only. There are
-- deliberately no UPDATE or DELETE policies: corrections are new snapshots,
-- never edits to evidence used for an inspection decision. The service role
-- remains capable of project cascade deletion and operational recovery.
-- ============================================

CREATE TABLE IF NOT EXISTS cgp_forecast_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'nws'
    CHECK (provider = 'nws'),
  source_url TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL,
  issued_at TIMESTAMPTZ,
  latitude NUMERIC(10, 7) NOT NULL
    CHECK (latitude >= -90 AND latitude <= 90),
  longitude NUMERIC(10, 7) NOT NULL
    CHECK (longitude >= -180 AND longitude <= 180),
  site_timezone TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL
    CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  parser_version TEXT NOT NULL,
  normalization_status TEXT NOT NULL
    CHECK (normalization_status IN ('normalized', 'unknown')),
  normalization_reason_codes JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(normalization_reason_codes) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cgp_forecast_snapshots_project_retrieved
  ON cgp_forecast_snapshots(project_id, retrieved_at DESC);

CREATE INDEX IF NOT EXISTS idx_cgp_forecast_snapshots_payload_hash
  ON cgp_forecast_snapshots(project_id, payload_sha256);

CREATE TABLE IF NOT EXISTS cgp_forecast_intervals (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL
    REFERENCES cgp_forecast_snapshots(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sequence_index INTEGER NOT NULL CHECK (sequence_index >= 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  probability_percent NUMERIC(5, 2)
    CHECK (probability_percent IS NULL OR
      (probability_percent >= 0 AND probability_percent <= 100)),
  qpf_inches NUMERIC(8, 4)
    CHECK (qpf_inches IS NULL OR qpf_inches >= 0),
  quality_status TEXT NOT NULL
    CHECK (quality_status IN
      ('complete', 'missing-pop', 'missing-qpf', 'missing-both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (snapshot_id, sequence_index),
  UNIQUE (snapshot_id, starts_at)
);

CREATE INDEX IF NOT EXISTS idx_cgp_forecast_intervals_project_start
  ON cgp_forecast_intervals(project_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_cgp_forecast_intervals_snapshot
  ON cgp_forecast_intervals(snapshot_id, sequence_index);

ALTER TABLE cgp_forecast_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE cgp_forecast_intervals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cgp_forecast_snapshots_select"
  ON cgp_forecast_snapshots FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));

CREATE POLICY "cgp_forecast_snapshots_insert"
  ON cgp_forecast_snapshots FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));

CREATE POLICY "cgp_forecast_intervals_select"
  ON cgp_forecast_intervals FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));

CREATE POLICY "cgp_forecast_intervals_insert"
  ON cgp_forecast_intervals FOR INSERT
  WITH CHECK (
    project_id IN (SELECT auth_user_project_ids())
    AND snapshot_id IN (
      SELECT id FROM cgp_forecast_snapshots snapshot
      WHERE snapshot.project_id = cgp_forecast_intervals.project_id
    )
  );

-- One RPC keeps the parent snapshot and all normalized intervals atomic.
-- SECURITY INVOKER is deliberate: both inserts run under the caller's RLS
-- identity, so a user cannot capture evidence for another tenant's project.
CREATE OR REPLACE FUNCTION capture_cgp_forecast_evidence(
  p_snapshot JSONB,
  p_intervals JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  captured_snapshot_id TEXT;
BEGIN
  IF jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'p_snapshot must be a JSON object';
  END IF;
  IF jsonb_typeof(p_intervals) <> 'array' THEN
    RAISE EXCEPTION 'p_intervals must be a JSON array';
  END IF;

  captured_snapshot_id := p_snapshot->>'id';

  INSERT INTO cgp_forecast_snapshots (
    id,
    project_id,
    provider,
    source_url,
    retrieved_at,
    issued_at,
    latitude,
    longitude,
    site_timezone,
    raw_payload,
    payload_sha256,
    parser_version,
    normalization_status,
    normalization_reason_codes
  ) VALUES (
    captured_snapshot_id,
    p_snapshot->>'project_id',
    p_snapshot->>'provider',
    p_snapshot->>'source_url',
    (p_snapshot->>'retrieved_at')::TIMESTAMPTZ,
    NULLIF(p_snapshot->>'issued_at', '')::TIMESTAMPTZ,
    (p_snapshot->>'latitude')::NUMERIC,
    (p_snapshot->>'longitude')::NUMERIC,
    p_snapshot->>'site_timezone',
    p_snapshot->'raw_payload',
    p_snapshot->>'payload_sha256',
    p_snapshot->>'parser_version',
    p_snapshot->>'normalization_status',
    COALESCE(p_snapshot->'normalization_reason_codes', '[]'::JSONB)
  );

  INSERT INTO cgp_forecast_intervals (
    id,
    snapshot_id,
    project_id,
    sequence_index,
    starts_at,
    ends_at,
    probability_percent,
    qpf_inches,
    quality_status
  )
  SELECT
    item->>'id',
    captured_snapshot_id,
    p_snapshot->>'project_id',
    (item->>'sequence_index')::INTEGER,
    (item->>'starts_at')::TIMESTAMPTZ,
    (item->>'ends_at')::TIMESTAMPTZ,
    NULLIF(item->>'probability_percent', '')::NUMERIC,
    NULLIF(item->>'qpf_inches', '')::NUMERIC,
    item->>'quality_status'
  FROM jsonb_array_elements(p_intervals) AS item;

  RETURN captured_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION capture_cgp_forecast_evidence(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capture_cgp_forecast_evidence(JSONB, JSONB)
  TO authenticated, service_role;
