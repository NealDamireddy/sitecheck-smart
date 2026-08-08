import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  siteRecordCreate,
  type SiteRecordCreateInput,
} from '@/lib/validations/site-record';
import type { SiteRecordCreateResult } from '@/types/site-record';

const resultSchema = z.object({
  siteRecordId: z.string().uuid(),
  detailId: z.string().min(1),
  recordType: z.enum([
    'weekly_inspection',
    'monthly_inspection',
    'smarts_ad_hoc',
  ]),
  workflowStatus: z.enum([
    'draft',
    'validating',
    'ready',
    'running',
    'needs_review',
    'verified',
    'failed',
    'archived',
  ]),
  reportingYearStart: z.number().int().optional(),
  created: z.boolean(),
});

export type SiteRecordCreateErrorCode =
  | 'project_not_found'
  | 'assignment_required'
  | 'idempotency_conflict'
  | 'closed_reporting_year'
  | 'future_reporting_year'
  | 'profile_required'
  | 'migration_required'
  | 'persistence_failed';

export class SiteRecordCreateError extends Error {
  constructor(public readonly code: SiteRecordCreateErrorCode) {
    super(code);
    this.name = 'SiteRecordCreateError';
  }
}

function errorCode(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? '';
  if (message.includes('PROJECT_NOT_FOUND')) {
    return 'project_not_found' as const;
  }
  if (message.includes('NO_ACTIVE_SITE_ASSIGNMENT')) {
    return 'assignment_required' as const;
  }
  if (message.includes('SITE_RECORD_IDEMPOTENCY_CONFLICT')) {
    return 'idempotency_conflict' as const;
  }
  if (message.includes('CLOSED_SMARTS_REPORTING_YEAR')) {
    return 'closed_reporting_year' as const;
  }
  if (message.includes('SMARTS_REPORTING_YEAR_NOT_OPEN')) {
    return 'future_reporting_year' as const;
  }
  if (message.includes('ACTIVE_INSPECTOR_PROFILE_REQUIRED')) {
    return 'profile_required' as const;
  }
  if (error?.code === 'PGRST202' || message.includes('does not exist')) {
    return 'migration_required' as const;
  }
  return 'persistence_failed' as const;
}

export async function createSiteRecord(
  supabase: SupabaseClient,
  untrustedInput: SiteRecordCreateInput
): Promise<SiteRecordCreateResult> {
  const input = siteRecordCreate.parse(untrustedInput);
  const { data, error } = await supabase.rpc('create_site_record_with_detail', {
    p_project_id: input.projectId,
    p_record_type: input.recordType,
    p_idempotency_key: input.idempotencyKey,
    p_title: input.title ?? null,
    p_observed_from: input.observedFrom ?? null,
    p_observed_to: input.observedTo ?? null,
    p_detail: input.detail,
    p_source: input.source ?? null,
  });

  if (error || !data) {
    throw new SiteRecordCreateError(errorCode(error));
  }

  const parsed = resultSchema.safeParse(data);
  if (!parsed.success) {
    throw new SiteRecordCreateError('persistence_failed');
  }
  return parsed.data;
}
