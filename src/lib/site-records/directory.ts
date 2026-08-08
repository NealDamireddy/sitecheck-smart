import type { SiteRecordDirectoryItem } from '@/types/site-record';

export interface SiteRecordDirectoryRow {
  site_record_id: string;
  org_id: string;
  company_name: string;
  inspector_user_id: string;
  inspector_name: string;
  inspector_title: string | null;
  assignment_role: 'lead' | 'inspector' | 'reviewer';
  project_id: string;
  site_name: string;
  wdid: string;
  record_type: SiteRecordDirectoryItem['recordType'];
  workflow_status: SiteRecordDirectoryItem['workflowStatus'];
  title: string | null;
  observed_from: string | null;
  observed_to: string | null;
  inspection_id: string | null;
  smarts_event_id: string | null;
  reporting_year_start: number | null;
  portal_report_id: string | null;
  portal_status: string | null;
  readback_status: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function directoryRecord(
  row: SiteRecordDirectoryRow
): SiteRecordDirectoryItem {
  return {
    siteRecordId: row.site_record_id,
    company: { id: row.org_id, name: row.company_name },
    inspector: {
      userId: row.inspector_user_id,
      name: row.inspector_name,
      title: row.inspector_title,
      assignmentRole: row.assignment_role,
    },
    site: { id: row.project_id, name: row.site_name, wdid: row.wdid },
    recordType: row.record_type,
    workflowStatus: row.workflow_status,
    title: row.title,
    observedFrom: row.observed_from,
    observedTo: row.observed_to,
    detail: {
      inspectionId: row.inspection_id,
      smartsEventId: row.smarts_event_id,
      reportingYearStart: row.reporting_year_start,
      portalReportId: row.portal_report_id,
      portalStatus: row.portal_status,
      readbackStatus: row.readback_status,
    },
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
