-- ============================================================
-- 026 - Keep Phase 4 record status aligned with field workflows
-- ============================================================
-- The inspector UI routes weekly/monthly records into the established
-- inspection checklist and SMARTS records into event capture. These triggers
-- make the common site_records directory reflect completion without relying
-- on a second, failure-prone browser request.

CREATE OR REPLACE FUNCTION public.sync_inspection_site_record_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.site_records record
  SET workflow_status = CASE NEW.status
      WHEN 'submitted' THEN 'verified'
      WHEN 'in-progress' THEN 'running'
      WHEN 'archived' THEN 'archived'
      ELSE 'draft'
    END,
    updated_at = NOW()
  FROM public.site_record_inspections link
  WHERE link.site_record_id = record.id
    AND link.project_id = record.project_id
    AND link.inspection_id = NEW.id
    AND record.workflow_status IS DISTINCT FROM CASE NEW.status
      WHEN 'submitted' THEN 'verified'
      WHEN 'in-progress' THEN 'running'
      WHEN 'archived' THEN 'archived'
      ELSE 'draft'
    END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_inspection_site_record_status()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_inspection_site_record_status ON public.inspections;
CREATE TRIGGER sync_inspection_site_record_status
  AFTER UPDATE OF status ON public.inspections
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.sync_inspection_site_record_status();

CREATE OR REPLACE FUNCTION public.sync_smarts_site_record_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id TEXT := CASE
    WHEN TG_TABLE_NAME = 'smarts_report_records' THEN NEW.smarts_event_id
    ELSE NEW.id
  END;
  v_event_status TEXT;
BEGIN
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

DROP TRIGGER IF EXISTS sync_smarts_record_on_link
  ON public.smarts_report_records;
CREATE TRIGGER sync_smarts_record_on_link
  AFTER INSERT ON public.smarts_report_records
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_smarts_site_record_status();

DROP TRIGGER IF EXISTS sync_smarts_record_on_event
  ON public.smarts_events;
CREATE TRIGGER sync_smarts_record_on_event
  AFTER UPDATE OF status ON public.smarts_events
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.sync_smarts_site_record_status();
