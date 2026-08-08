-- ============================================================
-- 018 - Versioned CGP checklist results and inspection history
-- ============================================================
--
-- Phase 2 storage only. This migration does not switch the existing API,
-- reports, or field UI to the new workflow. All new inspection columns are
-- nullable/defaulted so legacy inspection creation continues to work.
--
-- Historical-record invariant:
--   Each submitted checklist gets 22 immutable result rows containing a
--   snapshot of the category, prompt, answer, and any exception details.
--   Reports must eventually read those rows, never current checkpoint state.

-- ============================================================
-- 1. Versioned master checklist
-- ============================================================
CREATE TABLE cgp_checklist_templates (
  id             TEXT PRIMARY KEY,
  permit_order   TEXT NOT NULL,
  project_type   TEXT NOT NULL CHECK (project_type IN ('traditional', 'linear')),
  risk_level     INTEGER NOT NULL CHECK (risk_level IN (1, 2, 3)),
  report_part    INTEGER NOT NULL DEFAULT 2 CHECK (report_part > 0),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  title          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'retired')),
  effective_on   DATE NOT NULL,
  retired_on     DATE,
  item_count     INTEGER NOT NULL CHECK (item_count > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (retired_on IS NULL OR retired_on >= effective_on),
  UNIQUE (permit_order, project_type, risk_level, report_part, version_number)
);

CREATE TABLE master_checklist_items (
  checklist_template_id TEXT NOT NULL
    REFERENCES cgp_checklist_templates(id) ON DELETE RESTRICT,
  item_id          TEXT NOT NULL,
  category_number  INTEGER NOT NULL CHECK (category_number BETWEEN 1 AND 8),
  category_title   TEXT NOT NULL,
  item_number      INTEGER NOT NULL CHECK (item_number > 0),
  prompt           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (checklist_template_id, item_id),
  UNIQUE (checklist_template_id, category_number, item_number),
  CHECK (BTRIM(item_id) <> ''),
  CHECK (BTRIM(category_title) <> ''),
  CHECK (BTRIM(prompt) <> '')
);

INSERT INTO cgp_checklist_templates (
  id,
  permit_order,
  project_type,
  risk_level,
  report_part,
  version_number,
  title,
  status,
  effective_on,
  item_count
) VALUES (
  '2022-0057-DWQ/traditional/risk-2/part-2-v1',
  '2022-0057-DWQ',
  'traditional',
  2,
  2,
  1,
  'Minimum BMPs for Risk Level 2 Sites',
  'active',
  DATE '2023-09-01',
  22
);

-- CHECKLIST_SEED_JSON_BEGIN
WITH checklist_seed AS (
  SELECT *
  FROM jsonb_to_recordset(
$checklist$[
  {"item_id":"gh-cm-1","category_number":1,"category_title":"Good Housekeeping for Construction Materials","item_number":1,"prompt":"Are stockpiled construction materials not actively in use (not scheduled to be disturbed for 14 days) covered or bermed?"},
  {"item_id":"gh-cm-2","category_number":1,"category_title":"Good Housekeeping for Construction Materials","item_number":2,"prompt":"Are all chemicals stored in watertight containers with appropriate secondary containment, or in a completely enclosed storage shed?"},
  {"item_id":"gh-wm-1","category_number":2,"category_title":"Good Housekeeping for Waste Management","item_number":1,"prompt":"Are concrete wash/rinse water and materials prevented from being disposed into the storm drain system?"},
  {"item_id":"gh-wm-2","category_number":2,"category_title":"Good Housekeeping for Waste Management","item_number":2,"prompt":"Are portable toilets & handwash stations equipped with secondary containment to prevent discharges of waste?"},
  {"item_id":"gh-wm-3","category_number":2,"category_title":"Good Housekeeping for Waste Management","item_number":3,"prompt":"Is equipment in place to cover waste disposal containers at the end of the business day?"},
  {"item_id":"gh-wm-4","category_number":2,"category_title":"Good Housekeeping for Waste Management","item_number":4,"prompt":"Is the site free from litter/rubbish/debris from food and construction waste materials?"},
  {"item_id":"gh-wm-5","category_number":2,"category_title":"Good Housekeeping for Waste Management","item_number":5,"prompt":"Is equipment and materials in place for cleanup of hazardous and non-hazardous spills on-site?"},
  {"item_id":"gh-wm-6","category_number":2,"category_title":"Good Housekeeping for Waste Management","item_number":6,"prompt":"Are washout areas (i.e. concrete) contained appropriately to prevent discharge or infiltration into underlying soil?"},
  {"item_id":"gh-vs-1","category_number":3,"category_title":"Good Housekeeping for Vehicle Storage and Maintenance","item_number":1,"prompt":"Are measures in place to prevent oil, grease, or fuel from leaking into the ground, storm drains or surface waters?"},
  {"item_id":"gh-vs-2","category_number":3,"category_title":"Good Housekeeping for Vehicle Storage and Maintenance","item_number":2,"prompt":"Is all equipment or vehicles fueled, maintained, and stored in a designated area with appropriate BMPs?"},
  {"item_id":"gh-vs-3","category_number":3,"category_title":"Good Housekeeping for Vehicle Storage and Maintenance","item_number":3,"prompt":"Are vehicle and equipment leaks cleaned immediately and disposed of properly?"},
  {"item_id":"gh-lm-1","category_number":4,"category_title":"Good Housekeeping for Landscape Materials","item_number":1,"prompt":"Are stockpiled landscape materials such mulches and topsoil contained and covered when not actively in use?"},
  {"item_id":"gh-lm-2","category_number":4,"category_title":"Good Housekeeping for Landscape Materials","item_number":2,"prompt":"Are bagged erodible landscape materials stored on pallets and covered?"},
  {"item_id":"nsw-1","category_number":5,"category_title":"Non-Stormwater Management","item_number":1,"prompt":"Are Non-stormwater discharges properly controlled?"},
  {"item_id":"nsw-2","category_number":5,"category_title":"Non-Stormwater Management","item_number":2,"prompt":"Are vehicles washed in a manner to prevent non-stormwater discharges to surface waters or storm drainage systems?"},
  {"item_id":"nsw-3","category_number":5,"category_title":"Non-Stormwater Management","item_number":3,"prompt":"Are streets cleaned in a manner to prevent unauthorized non-stormwater discharges to surface waters or storm drainage systems?"},
  {"item_id":"ec-1","category_number":6,"category_title":"Erosion Controls","item_number":1,"prompt":"Are wind erosion controls effectively implemented?"},
  {"item_id":"ec-2","category_number":6,"category_title":"Erosion Controls","item_number":2,"prompt":"Is effective soil cover provided for disturbed inactive areas (not scheduled to be disturbed for 14 days) as well as finished slopes, open space, utility backfill, and completed lots?"},
  {"item_id":"sc-1","category_number":7,"category_title":"Sediment Controls","item_number":1,"prompt":"Are perimeter and slope controls established and effective at controlling erosion and sediment discharges from the site?"},
  {"item_id":"sc-2","category_number":7,"category_title":"Sediment Controls","item_number":2,"prompt":"Are entrances and exits stabilized to control erosion and sediment discharges from the site?"},
  {"item_id":"sc-3","category_number":7,"category_title":"Sediment Controls","item_number":3,"prompt":"Are all storm drain inlets BMP's maintained and protected?"},
  {"item_id":"ror-1","category_number":8,"category_title":"Run-On and Run-Off Controls","item_number":1,"prompt":"Is run-on to the site effectively managed and directed away from all disturbed areas?"}
]$checklist$::jsonb
  ) AS item(
    item_id TEXT,
    category_number INTEGER,
    category_title TEXT,
    item_number INTEGER,
    prompt TEXT
  )
)
INSERT INTO master_checklist_items (
  checklist_template_id,
  item_id,
  category_number,
  category_title,
  item_number,
  prompt
)
SELECT
  '2022-0057-DWQ/traditional/risk-2/part-2-v1',
  item_id,
  category_number,
  category_title,
  item_number,
  prompt
FROM checklist_seed;
-- CHECKLIST_SEED_JSON_END

-- ============================================================
-- 2. Inspection-level checklist identity and history summary
-- ============================================================
ALTER TABLE inspections
  -- Project/QSP values are copied at inspection time so history does not
  -- change when the project or practitioner profile is edited later.
  ADD COLUMN site_name_snapshot TEXT,
  ADD COLUMN wdid_snapshot TEXT,
  ADD COLUMN risk_level_snapshot INTEGER
    CHECK (risk_level_snapshot IS NULL OR risk_level_snapshot IN (1, 2, 3)),
  ADD COLUMN construction_stage_snapshot TEXT,
  ADD COLUMN photos_taken BOOLEAN,
  ADD COLUMN inspector_title_snapshot TEXT,
  ADD COLUMN qsp_license_number_snapshot TEXT,
  ADD COLUMN qsp_company_snapshot TEXT,

  -- Part 1 precipitation and site-observation fields. These names match the
  -- existing report generator, which already attempts to read them.
  ADD COLUMN qpe_start TIMESTAMPTZ,
  ADD COLUMN qpe_end TIMESTAMPTZ,
  ADD COLUMN qpe_duration_hours NUMERIC(8, 2)
    CHECK (qpe_duration_hours IS NULL OR qpe_duration_hours >= 0),
  ADD COLUMN rain_gauge_inches NUMERIC(8, 3)
    CHECK (rain_gauge_inches IS NULL OR rain_gauge_inches >= 0),
  ADD COLUMN obs_precipitation BOOLEAN,
  ADD COLUMN obs_discolorations BOOLEAN,
  ADD COLUMN obs_odors BOOLEAN,
  ADD COLUMN obs_turbidity BOOLEAN,
  ADD COLUMN obs_sheen BOOLEAN,
  ADD COLUMN obs_floating_material BOOLEAN,
  ADD COLUMN obs_suspended_material BOOLEAN,
  ADD COLUMN observation_comments TEXT,
  ADD COLUMN exemption_documentation TEXT,

  ADD COLUMN checklist_template_id TEXT
    REFERENCES cgp_checklist_templates(id) ON DELETE RESTRICT,
  ADD COLUMN checklist_observed_at TIMESTAMPTZ,
  ADD COLUMN unflagged_items_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN unflagged_items_confirmed_at TIMESTAMPTZ,
  ADD COLUMN unflagged_items_confirmed_by UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN checklist_attested_by_name TEXT,
  ADD COLUMN checklist_compliant_count INTEGER
    CHECK (checklist_compliant_count IS NULL OR checklist_compliant_count >= 0),
  ADD COLUMN checklist_deficient_count INTEGER
    CHECK (checklist_deficient_count IS NULL OR checklist_deficient_count >= 0),
  ADD CONSTRAINT inspections_checklist_attestation_consistent CHECK (
    unflagged_items_confirmed = FALSE
    OR (
      checklist_template_id IS NOT NULL
      AND checklist_observed_at IS NOT NULL
      AND unflagged_items_confirmed_at IS NOT NULL
      AND BTRIM(COALESCE(checklist_attested_by_name, '')) <> ''
      AND checklist_compliant_count IS NOT NULL
      AND checklist_deficient_count IS NOT NULL
    )
  ),
  ADD CONSTRAINT inspections_checklist_counts_consistent CHECK (
    (checklist_compliant_count IS NULL AND checklist_deficient_count IS NULL)
    OR
    (checklist_compliant_count IS NOT NULL AND checklist_deficient_count IS NOT NULL)
  ),
  ADD CONSTRAINT inspections_qpe_timeline_order CHECK (
    qpe_start IS NULL OR qpe_end IS NULL OR qpe_end >= qpe_start
  ),
  ADD CONSTRAINT inspections_id_checklist_template_unique
    UNIQUE (id, checklist_template_id);

-- Supports the application's past-inspection list without scanning all rows.
CREATE INDEX idx_inspections_project_history
  ON inspections(project_id, date DESC, created_at DESC);

-- ============================================================
-- 3. Immutable expanded result rows
-- ============================================================
CREATE TABLE inspection_checklist_results (
  id                    BIGSERIAL PRIMARY KEY,
  inspection_id         TEXT NOT NULL,
  checklist_template_id TEXT NOT NULL,
  checklist_item_id     TEXT NOT NULL,

  -- Snapshots: these values intentionally duplicate the master item so a
  -- future permit/template edit cannot rewrite an older inspection.
  category_number       INTEGER NOT NULL CHECK (category_number BETWEEN 1 AND 8),
  category_title        TEXT NOT NULL,
  item_number           INTEGER NOT NULL CHECK (item_number > 0),
  prompt                TEXT NOT NULL,
  answer                TEXT NOT NULL CHECK (answer IN ('yes', 'no')),
  answer_source         TEXT NOT NULL CHECK (
    answer_source IN ('qsp-unflagged-attestation', 'qsp-exception')
  ),

  exception_description TEXT,
  recommendation        TEXT,
  identified_at         TIMESTAMPTZ,
  repair_start_due_at   TIMESTAMPTZ,
  action_implemented_at TIMESTAMPTZ,

  -- Optional evidence snapshots. No FK is used for checkpoint_id_snapshot:
  -- deleting a map checkpoint must not erase its identifier from history.
  checkpoint_id_snapshot TEXT,
  location_snapshot      TEXT,
  photo_urls             JSONB NOT NULL DEFAULT '[]'::jsonb,
  recorded_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT inspection_results_inspection_template_fk
    FOREIGN KEY (inspection_id, checklist_template_id)
    REFERENCES inspections(id, checklist_template_id) ON DELETE CASCADE,
  CONSTRAINT inspection_results_master_item_fk
    FOREIGN KEY (checklist_template_id, checklist_item_id)
    REFERENCES master_checklist_items(checklist_template_id, item_id)
    ON DELETE RESTRICT,
  CONSTRAINT inspection_results_one_answer_per_item
    UNIQUE (inspection_id, checklist_item_id),
  CONSTRAINT inspection_results_inspection_id_pair
    UNIQUE (inspection_id, id),
  CONSTRAINT inspection_results_answer_details CHECK (
    (
      answer = 'yes'
      AND answer_source = 'qsp-unflagged-attestation'
      AND exception_description IS NULL
      AND recommendation IS NULL
      AND identified_at IS NULL
      AND repair_start_due_at IS NULL
    )
    OR
    (
      answer = 'no'
      AND answer_source = 'qsp-exception'
      AND BTRIM(COALESCE(exception_description, '')) <> ''
      AND BTRIM(COALESCE(recommendation, '')) <> ''
      AND identified_at IS NOT NULL
      AND repair_start_due_at IS NOT NULL
      AND repair_start_due_at = identified_at + INTERVAL '72 hours'
    )
  ),
  CHECK (BTRIM(category_title) <> ''),
  CHECK (BTRIM(prompt) <> ''),
  CHECK (jsonb_typeof(photo_urls) = 'array')
);

CREATE INDEX idx_inspection_checklist_results_inspection_order
  ON inspection_checklist_results(
    inspection_id,
    category_number,
    item_number
  );

CREATE INDEX idx_inspection_checklist_results_exceptions
  ON inspection_checklist_results(inspection_id, checklist_item_id)
  WHERE answer = 'no';

-- ============================================================
-- 4. Link workflow deficiencies to exact inspection result rows
-- ============================================================
-- Existing checkpoint deficiencies remain valid. New checklist deficiencies
-- may exist without a physical checkpoint, so checkpoint_id becomes optional.
ALTER TABLE deficiencies
  ALTER COLUMN checkpoint_id DROP NOT NULL,
  ADD COLUMN inspection_id TEXT REFERENCES inspections(id) ON DELETE SET NULL,
  ADD COLUMN inspection_checklist_result_id BIGINT,
  ADD COLUMN recommendation TEXT,
  ADD COLUMN repair_start_due_at TIMESTAMPTZ,
  ADD COLUMN repair_started_at TIMESTAMPTZ,
  ADD COLUMN repair_completed_at TIMESTAMPTZ,
  ADD COLUMN verified_at TIMESTAMPTZ,
  ADD COLUMN verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN action_implemented_at TIMESTAMPTZ,
  ADD CONSTRAINT deficiencies_checklist_result_fk
    FOREIGN KEY (inspection_id, inspection_checklist_result_id)
    REFERENCES inspection_checklist_results(inspection_id, id)
    ON DELETE SET NULL,
  ADD CONSTRAINT deficiencies_one_per_checklist_result
    UNIQUE (inspection_checklist_result_id),
  ADD CONSTRAINT deficiencies_repair_timeline_order CHECK (
    (repair_started_at IS NULL OR repair_start_due_at IS NULL
      OR repair_started_at >= detected_date)
    AND (repair_completed_at IS NULL OR repair_started_at IS NULL
      OR repair_completed_at >= repair_started_at)
    AND (verified_at IS NULL OR repair_completed_at IS NULL
      OR verified_at >= repair_completed_at)
  );

-- Preserve the existing values while introducing clearer field names.
UPDATE deficiencies
SET
  recommendation = corrective_action,
  repair_start_due_at = deadline
WHERE recommendation IS NULL OR repair_start_due_at IS NULL;

CREATE INDEX idx_deficiencies_inspection
  ON deficiencies(inspection_id, detected_date DESC)
  WHERE inspection_id IS NOT NULL;

-- ============================================================
-- 5. Tenant isolation and read-only master data
-- ============================================================
ALTER TABLE cgp_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_checklist_results ENABLE ROW LEVEL SECURITY;

-- Regulatory templates are shared, non-sensitive reference data. Authenticated
-- users can read them; only migrations/service-role workflows may change them.
CREATE POLICY cgp_checklist_templates_select
  ON cgp_checklist_templates FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY master_checklist_items_select
  ON master_checklist_items FOR SELECT TO authenticated
  USING (TRUE);

-- Inspection snapshots are tenant-scoped and append-only for normal users.
-- There are intentionally no UPDATE or DELETE policies.
CREATE POLICY inspection_checklist_results_select
  ON inspection_checklist_results FOR SELECT TO authenticated
  USING (
    inspection_id IN (
      SELECT id FROM inspections
      WHERE project_id IN (SELECT auth_user_project_ids())
    )
  );

CREATE POLICY inspection_checklist_results_insert
  ON inspection_checklist_results FOR INSERT TO authenticated
  WITH CHECK (
    inspection_id IN (
      SELECT id FROM inspections
      WHERE project_id IN (SELECT auth_user_project_ids())
    )
  );

COMMENT ON TABLE inspection_checklist_results IS
  'Immutable per-inspection Part 2 checklist snapshots used for history, reports, and export.';
COMMENT ON COLUMN deficiencies.deadline IS
  'Legacy repair-start deadline; new checklist workflows also write repair_start_due_at.';
