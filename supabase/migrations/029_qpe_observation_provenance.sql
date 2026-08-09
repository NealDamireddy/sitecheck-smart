-- ============================================
-- Migration 029: QPE observation evidence and determination provenance
-- ============================================
-- `qp_events` records that a qualifying precipitation event happened, but not
-- how that was known — no source, no gauge coverage, no evidence. A QPE
-- determination decides whether a legally required inspection is triggered, so
-- "0.42 inches fell" needs to be answerable with "according to what".
--
-- Migration 017 already established the pattern for forecasts: append-only
-- snapshots holding the raw payload, its hash, and the parser version. This
-- applies the same pattern to OBSERVATIONS and adds provenance to the
-- determination itself.
--
-- The failure this exists to catch: a NOAA station with no working gauge
-- returns 0.00", which reads as "no event", which means no post-storm
-- inspection. src/lib/qpe/observed.ts already computes a coverage figure and
-- knows when it is untrustworthy; there was previously nowhere to record it.
--
-- Same policy shape as 017 — SELECT and INSERT for authenticated users,
-- deliberately no UPDATE or DELETE. A correction is a new snapshot and a new
-- determination linked by superseded_by, never an edit to evidence that a
-- compliance decision already relied on.
--
-- Both tables are empty at the time of writing, so there is no backfill.
-- ============================================

CREATE TABLE IF NOT EXISTS cgp_observation_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Tier that produced this reading. 'site_gauge' is a measurement at the
  -- site; 'noaa_station' is a measurement nearby; 'open_meteo' is a model
  -- estimate. The distinction is the point of this column.
  provider TEXT NOT NULL
    CHECK (provider IN ('site_gauge', 'noaa_station', 'open_meteo')),

  source_url TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL,
  latitude NUMERIC(10, 7) NOT NULL
    CHECK (latitude >= -90 AND latitude <= 90),
  longitude NUMERIC(10, 7) NOT NULL
    CHECK (longitude >= -180 AND longitude <= 180),

  -- NOAA station identifier, e.g. 'KLVK'. Null for gridded sources and for
  -- readings a person entered.
  station_id TEXT,

  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  CONSTRAINT observation_window_ordered CHECK (window_end >= window_start),

  total_inches NUMERIC(6, 3) NOT NULL
    CHECK (total_inches >= 0 AND total_inches <= 100),

  -- Fraction of hours in the window backed by a real reading. A model source
  -- is 1 by construction; a station with a dead gauge approaches 0.
  coverage NUMERIC(4, 3) NOT NULL DEFAULT 1
    CHECK (coverage >= 0 AND coverage <= 1),

  -- How much to trust a 0.00 from this reading.
  quality TEXT NOT NULL
    CHECK (quality IN ('good', 'sparse', 'none')),

  raw_payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL
    CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  parser_version TEXT NOT NULL,

  -- Who keyed it in, for site_gauge readings. Null for automated sources.
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A person's reading must be attributable; an automated one must not pretend
-- to be. Enforced rather than trusted to the caller.
ALTER TABLE cgp_observation_snapshots
  DROP CONSTRAINT IF EXISTS observation_recorder_matches_provider;
ALTER TABLE cgp_observation_snapshots
  ADD CONSTRAINT observation_recorder_matches_provider CHECK (
    (provider = 'site_gauge' AND recorded_by IS NOT NULL)
    OR (provider <> 'site_gauge' AND recorded_by IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_cgp_observation_snapshots_project_window
  ON cgp_observation_snapshots (project_id, window_start DESC);

-- ---------------------------------------------------------------------------
-- Determination provenance on qp_events
-- ---------------------------------------------------------------------------

ALTER TABLE qp_events
  ADD COLUMN IF NOT EXISTS determination_provider TEXT
    CHECK (determination_provider IN ('site_gauge', 'noaa_station', 'open_meteo')),
  ADD COLUMN IF NOT EXISTS determination_snapshot_id TEXT
    REFERENCES cgp_observation_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS determination_quality TEXT
    CHECK (determination_quality IN ('good', 'sparse', 'none')),

  -- What the tiers that did NOT win reported. A gauge reading 0.00 while a
  -- model reads 0.61 is the most valuable signal in the system: it is either a
  -- broken gauge or a missed event, and both need a human.
  ADD COLUMN IF NOT EXISTS disagreement JSONB
    CHECK (disagreement IS NULL OR jsonb_typeof(disagreement) = 'array'),

  -- Corrections are new rows. When a QSP enters their gauge reading two days
  -- later, the earlier determination is superseded, not edited — rewriting a
  -- record a compliance decision already relied on is exactly what this
  -- column exists to prevent.
  ADD COLUMN IF NOT EXISTS superseded_by TEXT
    REFERENCES qp_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_qp_events_determination_snapshot
  ON qp_events (determination_snapshot_id)
  WHERE determination_snapshot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qp_events_superseded_by
  ON qp_events (superseded_by)
  WHERE superseded_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS — same shape as migration 017
-- ---------------------------------------------------------------------------

ALTER TABLE cgp_observation_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cgp_observation_snapshots_select" ON cgp_observation_snapshots;
CREATE POLICY "cgp_observation_snapshots_select"
  ON cgp_observation_snapshots FOR SELECT
  USING (project_id IN (SELECT auth_user_project_ids()));

DROP POLICY IF EXISTS "cgp_observation_snapshots_insert" ON cgp_observation_snapshots;
CREATE POLICY "cgp_observation_snapshots_insert"
  ON cgp_observation_snapshots FOR INSERT
  WITH CHECK (project_id IN (SELECT auth_user_project_ids()));

COMMENT ON TABLE cgp_observation_snapshots IS
  'Append-only observed-precipitation evidence. One row per source per window, including sources that lost the precedence contest — the disagreement is the record.';

COMMENT ON COLUMN qp_events.determination_provider IS
  'Which tier decided this event. site_gauge and noaa_station are measurements; open_meteo is a model estimate.';

COMMENT ON COLUMN qp_events.superseded_by IS
  'Points at a later determination. Evidence is never edited in place.';
