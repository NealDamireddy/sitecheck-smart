-- ============================================================
-- 019 - Atomic checklist submission
-- ============================================================
-- One SECURITY INVOKER function persists the inspection snapshot, all 22
-- checklist results, generated deficiencies, and activity record in the same
-- PostgreSQL transaction. Any validation/FK/RLS failure rolls everything back.

ALTER TABLE inspections
  ADD COLUMN checklist_submission_key TEXT,
  ADD COLUMN checklist_submission_sha256 TEXT
    CHECK (
      checklist_submission_sha256 IS NULL
      OR checklist_submission_sha256 ~ '^[0-9a-f]{64}$'
    );

CREATE UNIQUE INDEX idx_inspections_checklist_submission_key
  ON inspections(checklist_submission_key)
  WHERE checklist_submission_key IS NOT NULL;

CREATE OR REPLACE FUNCTION submit_inspection_checklist(
  p_inspection_id TEXT,
  p_submission JSONB,
  p_results JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inspection inspections%ROWTYPE;
  v_project projects%ROWTYPE;
  v_template cgp_checklist_templates%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_result_count INTEGER;
  v_compliant_count INTEGER;
  v_deficient_count INTEGER;
  v_qsp_name TEXT;
  v_qsp_license TEXT;
  v_qsp_company TEXT;
BEGIN
  IF COALESCE(jsonb_typeof(p_submission), 'null') <> 'object' THEN
    RAISE EXCEPTION 'INVALID_SUBMISSION: p_submission must be an object'
      USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(jsonb_typeof(p_results), 'null') <> 'array' THEN
    RAISE EXCEPTION 'INVALID_SUBMISSION: p_results must be an array'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_inspection
  FROM inspections
  WHERE id = p_inspection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSPECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Same key is a safe retry. A different key must never rewrite history.
  IF v_inspection.status = 'submitted' THEN
    IF v_inspection.checklist_submission_key = p_submission->>'submission_key' THEN
      RETURN jsonb_build_object(
        'id', v_inspection.id,
        'status', 'submitted',
        'created', FALSE,
        'submitted_at', v_inspection.submitted_at,
        'compliant_count', v_inspection.checklist_compliant_count,
        'deficient_count', v_inspection.checklist_deficient_count
      );
    END IF;
    RAISE EXCEPTION 'INSPECTION_ALREADY_SUBMITTED' USING ERRCODE = 'P0001';
  END IF;

  IF v_inspection.status NOT IN ('draft', 'in-progress') THEN
    RAISE EXCEPTION 'INSPECTION_NOT_SUBMITTABLE' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_project
  FROM projects
  WHERE id = v_inspection.project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Phase 3 remains deliberately limited to the verified pilot profile.
  IF v_project.project_type <> 'bounded-site' OR v_project.risk_level <> 2 THEN
    RAISE EXCEPTION 'UNSUPPORTED_PROFILE' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE((p_submission->>'unflagged_items_confirmed')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'REVIEW_ATTESTATION_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF BTRIM(COALESCE(p_submission->>'submission_key', '')) = '' THEN
    RAISE EXCEPTION 'SUBMISSION_KEY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_template
  FROM cgp_checklist_templates
  WHERE id = p_submission->>'checklist_template_id'
    AND project_type = 'traditional'
    AND risk_level = v_project.risk_level
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNSUPPORTED_CHECKLIST' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE item->>'answer' = 'yes')::INTEGER,
    COUNT(*) FILTER (WHERE item->>'answer' = 'no')::INTEGER
  INTO v_result_count, v_compliant_count, v_deficient_count
  FROM jsonb_array_elements(p_results) AS item;

  IF v_result_count <> v_template.item_count
     OR v_compliant_count + v_deficient_count <> v_template.item_count THEN
    RAISE EXCEPTION 'CHECKLIST_RESULT_COUNT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_results) AS result
    LEFT JOIN master_checklist_items master
      ON master.checklist_template_id = v_template.id
     AND master.item_id = result->>'checklist_item_id'
    WHERE master.item_id IS NULL
  ) THEN
    RAISE EXCEPTION 'UNKNOWN_CHECKLIST_ITEM' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve practitioner identity inside the transaction. Project and profile
  -- values are trusted database sources, not client-provided identity fields.
  SELECT
    COALESCE(NULLIF(BTRIM(profile.name), ''), NULLIF(BTRIM(v_project.qsp_name), ''), v_inspection.inspector),
    COALESCE(NULLIF(BTRIM(profile.license_number), ''), NULLIF(BTRIM(v_project.qsp_license_number), '')),
    COALESCE(NULLIF(BTRIM(profile.company), ''), NULLIF(BTRIM(v_project.qsp_company), ''))
  INTO v_qsp_name, v_qsp_license, v_qsp_company
  FROM (SELECT 1) AS seed
  LEFT JOIN qsp_profiles profile ON profile.user_id = auth.uid();

  UPDATE inspections
  SET
    status = 'submitted',
    submitted_at = v_now,
    report_id = COALESCE(NULLIF(p_submission->>'report_id', ''), report_id),
    inspector = v_qsp_name,
    site_name_snapshot = v_project.name,
    wdid_snapshot = v_project.wdid,
    risk_level_snapshot = v_project.risk_level,
    construction_stage_snapshot = p_submission->>'construction_stage',
    photos_taken = (p_submission->>'photos_taken')::BOOLEAN,
    inspector_title_snapshot = 'QSP',
    qsp_license_number_snapshot = v_qsp_license,
    qsp_company_snapshot = v_qsp_company,
    qpe_start = NULLIF(p_submission->>'qpe_start', '')::TIMESTAMPTZ,
    qpe_end = NULLIF(p_submission->>'qpe_end', '')::TIMESTAMPTZ,
    qpe_duration_hours = NULLIF(p_submission->>'qpe_duration_hours', '')::NUMERIC,
    rain_gauge_inches = NULLIF(p_submission->>'rain_gauge_inches', '')::NUMERIC,
    obs_precipitation = (p_submission->>'obs_precipitation')::BOOLEAN,
    obs_discolorations = (p_submission->>'obs_discolorations')::BOOLEAN,
    obs_odors = (p_submission->>'obs_odors')::BOOLEAN,
    obs_turbidity = (p_submission->>'obs_turbidity')::BOOLEAN,
    obs_sheen = (p_submission->>'obs_sheen')::BOOLEAN,
    obs_floating_material = (p_submission->>'obs_floating_material')::BOOLEAN,
    obs_suspended_material = (p_submission->>'obs_suspended_material')::BOOLEAN,
    observation_comments = NULLIF(p_submission->>'observation_comments', ''),
    exemption_documentation = NULLIF(p_submission->>'exemption_documentation', ''),
    checklist_template_id = v_template.id,
    checklist_observed_at = (p_submission->>'observed_at')::TIMESTAMPTZ,
    unflagged_items_confirmed = TRUE,
    unflagged_items_confirmed_at = v_now,
    unflagged_items_confirmed_by = auth.uid(),
    checklist_attested_by_name = v_qsp_name,
    checklist_compliant_count = v_compliant_count,
    checklist_deficient_count = v_deficient_count,
    checklist_submission_key = p_submission->>'submission_key',
    checklist_submission_sha256 = p_submission->>'submission_sha256'
  WHERE id = p_inspection_id;

  INSERT INTO inspection_checklist_results (
    inspection_id,
    checklist_template_id,
    checklist_item_id,
    category_number,
    category_title,
    item_number,
    prompt,
    answer,
    answer_source,
    exception_description,
    recommendation,
    identified_at,
    repair_start_due_at,
    action_implemented_at,
    checkpoint_id_snapshot,
    location_snapshot,
    photo_urls
  )
  SELECT
    p_inspection_id,
    v_template.id,
    item->>'checklist_item_id',
    (item->>'category_number')::INTEGER,
    item->>'category_title',
    (item->>'item_number')::INTEGER,
    item->>'prompt',
    item->>'answer',
    item->>'answer_source',
    NULLIF(item->>'exception_description', ''),
    NULLIF(item->>'recommendation', ''),
    NULLIF(item->>'identified_at', '')::TIMESTAMPTZ,
    NULLIF(item->>'repair_start_due_at', '')::TIMESTAMPTZ,
    NULLIF(item->>'action_implemented_at', '')::TIMESTAMPTZ,
    NULLIF(item->>'checkpoint_id_snapshot', ''),
    NULLIF(item->>'location_snapshot', ''),
    COALESCE(item->'photo_urls', '[]'::JSONB)
  FROM jsonb_array_elements(p_results) AS item;

  INSERT INTO deficiencies (
    id,
    checkpoint_id,
    project_id,
    inspection_id,
    inspection_checklist_result_id,
    detected_date,
    description,
    cgp_violation,
    corrective_action,
    recommendation,
    deadline,
    repair_start_due_at,
    action_implemented_at,
    status
  )
  SELECT
    'def-' || gen_random_uuid()::TEXT,
    NULLIF(item->>'checkpoint_id_snapshot', ''),
    v_inspection.project_id,
    p_inspection_id,
    result.id,
    (item->>'identified_at')::TIMESTAMPTZ,
    item->>'exception_description',
    '2022 CGP Part 2 checklist item ' || item->>'checklist_item_id',
    item->>'recommendation',
    item->>'recommendation',
    (item->>'repair_start_due_at')::TIMESTAMPTZ,
    (item->>'repair_start_due_at')::TIMESTAMPTZ,
    NULLIF(item->>'action_implemented_at', '')::TIMESTAMPTZ,
    'open'
  FROM jsonb_array_elements(p_results) AS item
  JOIN inspection_checklist_results result
    ON result.inspection_id = p_inspection_id
   AND result.checklist_item_id = item->>'checklist_item_id'
  WHERE item->>'answer' = 'no';

  INSERT INTO activity_events (
    id,
    project_id,
    type,
    title,
    description,
    timestamp,
    severity,
    linked_entity_id,
    linked_entity_type
  ) VALUES (
    'act-' || gen_random_uuid()::TEXT,
    v_inspection.project_id,
    'inspection',
    'Inspection Checklist Submitted',
    FORMAT(
      'Inspection %s submitted with %s compliant items and %s deficiencies.',
      p_inspection_id,
      v_compliant_count,
      v_deficient_count
    ),
    v_now,
    CASE WHEN v_deficient_count > 0 THEN 'warning' ELSE 'info' END,
    p_inspection_id,
    'inspection'
  );

  RETURN jsonb_build_object(
    'id', p_inspection_id,
    'status', 'submitted',
    'created', TRUE,
    'submitted_at', v_now,
    'result_count', v_result_count,
    'compliant_count', v_compliant_count,
    'deficient_count', v_deficient_count
  );
END;
$$;

REVOKE ALL ON FUNCTION submit_inspection_checklist(TEXT, JSONB, JSONB)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_inspection_checklist(TEXT, JSONB, JSONB)
  TO authenticated, service_role;
