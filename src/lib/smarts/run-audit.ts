/**
 * Durable audit writes for Sync-to-SMARTS runs (smarts_runs table).
 *
 * SERVER ONLY. Called exclusively from sync-job.ts. Uses the service-role
 * client because finalize() can run outside any request context — e.g. a
 * detached child process's exit listener has no cookies, so an RLS-scoped
 * auth client is unavailable there. RLS still protects reads (users only
 * SELECT their own rows via auth.uid()); these writes set user_id/project_id
 * explicitly.
 *
 * Status values map ONTO the existing SyncJobStatus — this module does not
 * invent a new state machine:
 *   running        -> 'running'
 *   filled         -> 'stopped_before_cert'   (success: stopped before certify)
 *   halted | error -> 'error'
 */

import { createAdminClient } from '@/lib/supabase/server';
import type { SyncJobStatus } from '@/lib/smarts/sync-job';
import { log } from '@/lib/logger';

export type RunAuditStatus = 'running' | 'stopped_before_cert' | 'error';

/** Translate the existing sync-job status onto the audit state machine. */
export function toRunAuditStatus(status: SyncJobStatus): RunAuditStatus {
  switch (status) {
    case 'running':
      return 'running';
    case 'filled':
      return 'stopped_before_cert';
    case 'halted':
    case 'error':
      return 'error';
  }
}

export interface RunStartRecord {
  jobId: string;
  userId: string;
  projectId: string;
  wdid: string | null;
  csvText: string | null;
}

export async function recordRunStart(record: RunStartRecord): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('smarts_runs').insert({
      job_id: record.jobId,
      user_id: record.userId,
      project_id: record.projectId,
      wdid: record.wdid,
      csv_text: record.csvText,
      status: 'running',
      started_at: new Date().toISOString(),
    });
    if (error) {
      log.error('smarts_runs start insert failed', { detail: error.message });
    }
  } catch (err) {
    // Audit logging must never break the sync flow.
    log.error('smarts_runs start insert threw', { err });
  }
}

export interface RunFinalizeRecord {
  jobId: string;
  status: RunAuditStatus;
  lastStepReached: string | null;
  errorMessage: string | null;
}

export async function recordRunFinalize(
  record: RunFinalizeRecord
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('smarts_runs')
      .update({
        status: record.status,
        last_step_reached: record.lastStepReached,
        error_message: record.errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('job_id', record.jobId);
    if (error) {
      log.error('smarts_runs finalize update failed', { detail: error.message });
    }
  } catch (err) {
    log.error('smarts_runs finalize update threw', { err });
  }
}
