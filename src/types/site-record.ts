export type SiteRecordType =
  | 'weekly_inspection'
  | 'monthly_inspection'
  | 'smarts_ad_hoc';

export type SiteRecordWorkflowStatus =
  | 'draft'
  | 'validating'
  | 'ready'
  | 'running'
  | 'needs_review'
  | 'verified'
  | 'failed'
  | 'archived';

export interface SiteRecordCreateResult {
  siteRecordId: string;
  detailId: string;
  recordType: SiteRecordType;
  workflowStatus: SiteRecordWorkflowStatus;
  reportingYearStart?: number;
  created: boolean;
}

export interface SiteRecordDirectoryItem {
  siteRecordId: string;
  company: {
    id: string;
    name: string;
  };
  inspector: {
    userId: string;
    name: string;
    title: string | null;
    assignmentRole: 'lead' | 'inspector' | 'reviewer';
  };
  site: {
    id: string;
    name: string;
    wdid: string;
  };
  recordType: SiteRecordType;
  workflowStatus: SiteRecordWorkflowStatus;
  title: string | null;
  observedFrom: string | null;
  observedTo: string | null;
  detail: {
    inspectionId: string | null;
    smartsEventId: string | null;
    reportingYearStart: number | null;
    portalReportId: string | null;
    portalStatus: string | null;
    readbackStatus: string | null;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiteRecordUpload {
  id: string;
  fileRole: 'source' | 'lab_result' | 'photo' | 'supporting_document';
  originalFilename: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  uploadStatus: 'stored' | 'verified' | 'rejected' | 'quarantined';
  createdAt: string;
  downloadUrl: string | null;
}

export interface SiteRecordStatusChange {
  id: number;
  fromStatus: SiteRecordWorkflowStatus | null;
  toStatus: SiteRecordWorkflowStatus;
  changedBy: string | null;
  changedAt: string;
  reason: string | null;
}

export interface InspectorWorkspaceState {
  project: {
    id: string;
    name: string;
    orgId: string;
    companyName: string;
  };
  membershipRole: 'owner' | 'admin' | 'qsp' | 'inspector' | 'viewer';
  canManageAssignments: boolean;
  profile: {
    userId: string;
    displayName: string;
    title: string | null;
    licenseNumber: string | null;
    phone: string | null;
    status: 'active' | 'inactive';
  } | null;
  assignment: {
    id: string;
    assignmentRole: 'lead' | 'inspector' | 'reviewer';
    status: 'active' | 'inactive';
    assignedAt: string;
    endedAt: string | null;
  } | null;
  team: Array<{
    userId: string;
    displayName: string;
    title: string | null;
    profileStatus: 'active' | 'inactive';
    assignment: {
      id: string;
      assignmentRole: 'lead' | 'inspector' | 'reviewer';
      status: 'active' | 'inactive';
      assignedAt: string;
      endedAt: string | null;
    } | null;
  }>;
  ready: boolean;
}
