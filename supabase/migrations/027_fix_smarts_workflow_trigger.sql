-- ============================================================
-- 027 - Fix polymorphic SMARTS trigger event-id resolution
-- ============================================================
-- A trigger function shared by smarts_report_records and smarts_events cannot
-- reference NEW.id inside a CASE compiled for smarts_report_records. Resolve
-- the table-specific field in an IF branch instead.

CREATE OR REPLACE FUNCTION public.sync_smarts_site_record_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id TEXT;
  v_event_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'smarts_report_records' THEN
    v_event_id := NEW.smarts_event_id;
  ELSE
    v_event_id := NEW.id;
  END IF;

  SELECT status INTO v_event_status
  FROM public.smarts_events
  WHERE id = v_event_id;

  UPDATE public.site_records record
  SET workflow_status = CASE v_event_status
      WHEN 'active' THEN 'running'
      WHEN 'ended' THEN 'ready'
      WHEN 'completed' THEN 'verified'
      ELSE 'draft'
    END,
    updated_at = NOW()
  FROM public.smarts_report_records report
  WHERE report.site_record_id = record.id
    AND report.project_id = record.project_id
    AND report.smarts_event_id = v_event_id
    AND record.workflow_status IS DISTINCT FROM CASE v_event_status
      WHEN 'active' THEN 'running'
      WHEN 'ended' THEN 'ready'
      WHEN 'completed' THEN 'verified'
      ELSE 'draft'
    END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_smarts_site_record_status()
  FROM PUBLIC, anon, authenticated;
