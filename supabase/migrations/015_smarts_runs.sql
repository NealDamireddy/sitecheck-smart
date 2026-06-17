-- ============================================
-- Migration 015: SMARTS run audit log
-- ============================================
-- One row per Sync-to-SMARTS launch, for commercial multi-tenant
-- auditability. This is the persistence counterpart to the existing
-- file-backed job store in src/lib/smarts/sync-job.ts: the job store
-- holds live process state + screenshots; this table is the durable,
-- per-user history of what ran, when, how far it got, and the exact CSV
-- the bot referenced.
--
-- Status values MAP ONTO the existing SyncJobStatus (running | filled |
-- halted | error) — this table does NOT invent a new state machine:
--   * sync-job 'running'        -> 'running'
--   * sync-job 'filled'         -> 'stopped_before_cert'
--   * sync-job 'halted'|'error' -> 'error'
-- 'stopped_before_cert' is the success terminal: the bot filled the Ad
-- Hoc Monitoring Report and STOPPED before certification — the human
-- certifies in SMARTS. The orchestrator never certifies/submits.
--
-- Writes happen ONLY from sync-job.ts (service-role client, since
-- finalize() can run outside any request context — e.g. a detached
-- child's exit listener). RLS below restricts reads to the owning user.
-- ============================================

CREATE TABLE smarts_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- = sync-job jobId (the file-backed job store key); unique per run.
  job_id TEXT NOT NULL UNIQUE,
  wdid TEXT,
  -- The exact CSV the bot referenced for this run, retained for audit
  -- (the production path rebuilds this server-side; never client-uploaded).
  csv_text TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'stopped_before_cert', 'error')),
  last_step_reached TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_smarts_runs_user_started
  ON smarts_runs(user_id, started_at DESC);

CREATE INDEX idx_smarts_runs_project
  ON smarts_runs(project_id);

-- ============================================
-- Row-Level Security — a user sees only their own runs.
-- ============================================
-- Writes are performed by the service-role client in sync-job.ts (which
-- bypasses RLS); the SELECT policy is the only access path for the UI.
ALTER TABLE smarts_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY smarts_runs_select_own ON smarts_runs
  FOR SELECT
  USING (user_id = auth.uid());
