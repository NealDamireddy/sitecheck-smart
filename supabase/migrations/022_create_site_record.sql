-- ============================================================
-- 022 - Atomic site-record creation boundary
-- ============================================================
-- REVIEW-GATED: apply only after migration 021.
--
-- One SECURITY INVOKER function creates the common site_records parent and
-- exactly one typed detail branch. PostgreSQL owns the transaction: any error
-- rolls back the parent, detail, source, link, and status-history trigger row.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_site_record_with_detail(
  p_project_id TEXT,
  p_record_type TEXT,
  p_idempotency_key TEXT,
  p_title TEXT DEFAULT NULL,
  p_observed_from TIMESTAMPTZ DEFAULT NULL,
  p_observed_to TIMESTAMPTZ DEFAULT NULL,
  p_detail JSONB DEFAULT '{}'::jsonb,
  p_source JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_org_id UUID;
  v_site_record_id UUID;
  v_detail_id TEXT;
  v_existing public.site_records%ROWTYPE;
  v_inspector_name TEXT;
  v_started_at TIMESTAMPTZ;
  v_ended_at TIMESTAMPTZ;
  v_reporting_year_start INTEGER;
  v_current_reporting_year_start INTEGER;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
  END IF;

  IF p_record_type NOT IN (
    'weekly_inspection', 'monthly_inspection', 'smarts_ad_hoc'
  ) THEN
    RAISE EXCEPTION 'UNSUPPORTED_SITE_RECORD_TYPE';
  END IF;

  IF BTRIM(COALESCE(p_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  IF p_observed_to IS NOT NULL AND p_observed_from IS NOT NULL
     AND p_observed_to < p_observed_from THEN
    RAISE EXCEPTION 'INVALID_OBSERVATION_WINDOW';
  END IF;

  -- This SELECT is RLS-scoped because the function is SECURITY INVOKER.
  SELECT org_id INTO v_org_id
  FROM public.projects
  WHERE id = p_project_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND';
  END IF;

  -- Serialize concurrent retries for the same company/key before checking for
  -- an existing row. This avoids a unique-constraint race producing a false
  -- failure when two clients submit the same request simultaneously.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_org_id::text || ':' || p_idempotency_key, 0)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_inspector_assignments
    WHERE org_id = v_org_id
      AND project_id = p_project_id
      AND inspector_user_id = v_actor
      AND status = 'active'
      AND (ended_at IS NULL OR ended_at > NOW())
  ) THEN
    RAISE EXCEPTION 'NO_ACTIVE_SITE_ASSIGNMENT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inspector_profiles
    WHERE org_id = v_org_id
      AND user_id = v_actor
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_INSPECTOR_PROFILE_REQUIRED';
  END IF;

  IF p_source IS NOT NULL THEN
    IF COALESCE(p_source->>'sourceType', '') NOT IN ('form', 'file', 'api') THEN
      RAISE EXCEPTION 'INVALID_SOURCE_TYPE';
    END IF;
    IF BTRIM(COALESCE(p_source->>'schemaVersion', '')) = '' THEN
      RAISE EXCEPTION 'SOURCE_SCHEMA_VERSION_REQUIRED';
    END IF;
    IF NULLIF(p_source->>'uploadId', '') IS NULL
       AND p_source->'rawPayload' IS NULL THEN
      RAISE EXCEPTION 'SOURCE_CONTENT_REQUIRED';
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM public.site_records
  WHERE org_id = v_org_id
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.project_id <> p_project_id
       OR v_existing.inspector_user_id <> v_actor
       OR v_existing.record_type <> p_record_type THEN
      RAISE EXCEPTION 'SITE_RECORD_IDEMPOTENCY_CONFLICT';
    END IF;

    IF p_record_type IN ('weekly_inspection', 'monthly_inspection') THEN
      SELECT inspection_id INTO v_detail_id
      FROM public.site_record_inspections
      WHERE site_record_id = v_existing.id;
    ELSE
      SELECT smarts_event_id INTO v_detail_id
      FROM public.smarts_report_records
      WHERE site_record_id = v_existing.id;
    END IF;

    RETURN jsonb_build_object(
      'siteRecordId', v_existing.id,
      'detailId', v_detail_id,
      'recordType', v_existing.record_type,
      'workflowStatus', v_existing.workflow_status,
      'created', FALSE
    );
  END IF;

  INSERT INTO public.site_records (
    org_id,
    project_id,
    inspector_user_id,
    idempotency_key,
    record_type,
    workflow_status,
    title,
    observed_from,
    observed_to,
    created_by
  ) VALUES (
    v_org_id,
    p_project_id,
    v_actor,
    p_idempotency_key,
    p_record_type,
    'draft',
    NULLIF(BTRIM(p_title), ''),
    p_observed_from,
    p_observed_to,
    v_actor
  )
  RETURNING id INTO v_site_record_id;

  SELECT display_name INTO v_inspector_name
  FROM public.inspector_profiles
  WHERE org_id = v_org_id
    AND user_id = v_actor
    AND status = 'active';

  IF p_record_type IN ('weekly_inspection', 'monthly_inspection') THEN
    v_detail_id := COALESCE(
      NULLIF(BTRIM(p_detail->>'inspectionId'), ''),
      'insp-' || gen_random_uuid()::text
    );

    INSERT INTO public.inspections (
      id,
      project_id,
      date,
      type,
      inspector,
      weather_temperature,
      weather_condition,
      weather_wind_speed_mph,
      weather_humidity,
      overall_compliance,
      trigger,
      status
    ) VALUES (
      v_detail_id,
      p_project_id,
      COALESCE((p_detail->>'inspectionDate')::timestamptz, p_observed_from, NOW()),
      COALESCE(NULLIF(p_detail->>'inspectionType', ''), 'routine'),
      COALESCE(NULLIF(p_detail->>'inspectorName', ''), v_inspector_name, 'Inspector'),
      COALESCE((p_detail->>'weatherTemperature')::integer, 0),
      COALESCE(NULLIF(p_detail->>'weatherCondition', ''), 'clear'),
      COALESCE((p_detail->>'weatherWindSpeedMph')::integer, 0),
      COALESCE((p_detail->>'weatherHumidity')::integer, 0),
      COALESCE((p_detail->>'overallCompliance')::integer, 0),
      'routine',
      'draft'
    );

    INSERT INTO public.site_record_inspections (
      site_record_id, project_id, inspection_id
    ) VALUES (
      v_site_record_id, p_project_id, v_detail_id
    );
  ELSE
    v_started_at := COALESCE(
      (p_detail->>'startedAt')::timestamptz,
      p_observed_from
    );
    v_ended_at := COALESCE(
      (p_detail->>'endedAt')::timestamptz,
      p_observed_to
    );

    IF v_started_at IS NULL THEN
      RAISE EXCEPTION 'SMARTS_EVENT_START_REQUIRED';
    END IF;
    IF v_ended_at IS NOT NULL AND v_ended_at < v_started_at THEN
      RAISE EXCEPTION 'INVALID_SMARTS_EVENT_WINDOW';
    END IF;

    v_reporting_year_start :=
      CASE
        WHEN EXTRACT(MONTH FROM v_started_at AT TIME ZONE 'America/Los_Angeles') >= 7
          THEN EXTRACT(YEAR FROM v_started_at AT TIME ZONE 'America/Los_Angeles')::integer
        ELSE EXTRACT(YEAR FROM v_started_at AT TIME ZONE 'America/Los_Angeles')::integer - 1
      END;

    v_current_reporting_year_start :=
      CASE
        WHEN EXTRACT(MONTH FROM NOW() AT TIME ZONE 'America/Los_Angeles') >= 7
          THEN EXTRACT(YEAR FROM NOW() AT TIME ZONE 'America/Los_Angeles')::integer
        ELSE EXTRACT(YEAR FROM NOW() AT TIME ZONE 'America/Los_Angeles')::integer - 1
      END;

    IF v_reporting_year_start < v_current_reporting_year_start THEN
      RAISE EXCEPTION 'CLOSED_SMARTS_REPORTING_YEAR';
    END IF;
    IF v_reporting_year_start > v_current_reporting_year_start THEN
      RAISE EXCEPTION 'SMARTS_REPORTING_YEAR_NOT_OPEN';
    END IF;

    v_detail_id := COALESCE(
      NULLIF(BTRIM(p_detail->>'smartsEventId'), ''),
      'smarts-evt-' || gen_random_uuid()::text
    );

    INSERT INTO public.smarts_events (
      id,
      project_id,
      status,
      source,
      forecast_detected_at,
      started_at,
      ended_at,
      precipitation_inches,
      notes
    ) VALUES (
      v_detail_id,
      p_project_id,
      CASE WHEN v_ended_at IS NULL THEN 'active' ELSE 'ended' END,
      'inspector_upload',
      COALESCE((p_detail->>'forecastDetectedAt')::timestamptz, NOW()),
      v_started_at,
      v_ended_at,
      (p_detail->>'precipitationInches')::numeric,
      NULLIF(p_detail->>'notes', '')
    );

    INSERT INTO public.smarts_report_records (
      site_record_id,
      project_id,
      smarts_event_id,
      reporting_year_start
    ) VALUES (
      v_site_record_id,
      p_project_id,
      v_detail_id,
      v_reporting_year_start
    );
  END IF;

  IF p_source IS NOT NULL THEN
    INSERT INTO public.site_record_sources (
      site_record_id,
      project_id,
      source_type,
      upload_id,
      raw_payload,
      payload_sha256,
      schema_version,
      captured_by
    ) VALUES (
      v_site_record_id,
      p_project_id,
      p_source->>'sourceType',
      NULLIF(p_source->>'uploadId', '')::uuid,
      p_source->'rawPayload',
      NULLIF(p_source->>'payloadSha256', ''),
      p_source->>'schemaVersion',
      v_actor
    );
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'siteRecordId', v_site_record_id,
    'detailId', v_detail_id,
    'recordType', p_record_type,
    'workflowStatus', 'draft',
    'reportingYearStart', v_reporting_year_start,
    'created', TRUE
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.create_site_record_with_detail(
  TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_site_record_with_detail(
  TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, JSONB
) TO authenticated, service_role;
