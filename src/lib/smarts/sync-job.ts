/**
 * Server-side runner for Sync-to-SMARTS jobs.
 *
 * Spawns the Playwright bot (smarts-automation/) as a detached child
 * process and tracks it in a file-backed job store under
 * smarts-automation/artifacts/sync-jobs/ (gitignored). File-backed so a
 * Next.js dev-server reload mid-run doesn't lose the job: the status
 * reader re-derives the outcome from the job's log file when the
 * in-process exit listener is gone.
 *
 * Credentials come from the APP server's env (SMARTS_USERNAME /
 * SMARTS_PASSWORD in .env.local) and are passed to the child via env —
 * they never transit the browser and are never written to the job files.
 *
 * Deployment note: this runs the bot on the same machine as the Next.js
 * server, which is correct for the current local-first setup. A hosted
 * deployment (Vercel etc.) cannot run Chromium in a route handler — the
 * spawn would move behind a queue to a worker box; the job-store shape
 * here is deliberately the same one a queue would persist.
 *
 * INVARIANT (inherited from the bot, do not relax): the bot NEVER
 * certifies, never checks the attestation, never submits. It fills and
 * stops; the human certifies in SMARTS.
 */

import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const BOT_DIR = resolve(process.cwd(), 'smarts-automation');
const JOBS_DIR = resolve(BOT_DIR, 'artifacts', 'sync-jobs');
const ARTIFACTS_ROOT = resolve(BOT_DIR, 'artifacts');

export type SyncJobStatus = 'running' | 'filled' | 'halted' | 'error';

export interface SyncJobScreenshots {
  samples: string[];
  dataSummary: string | null;
  certification: string | null;
  halt: string | null;
}

export interface SyncJobState {
  id: string;
  eventId: string;
  projectId: string;
  status: SyncJobStatus;
  pid: number | null;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  /** Bot halt reason / launch error — shown verbatim in the UI. */
  reason: string | null;
  screenshots: SyncJobScreenshots;
}

export interface SyncJobView extends SyncJobState {
  /** Last lines of the bot's run log, for the live progress view. */
  logTail: string[];
}

export function smartsCredentialsConfigured(): boolean {
  return Boolean(
    process.env.SMARTS_USERNAME?.trim() && process.env.SMARTS_PASSWORD?.trim()
  );
}

function statePath(jobId: string): string {
  return resolve(JOBS_DIR, `${jobId}.json`);
}

function logPath(jobId: string): string {
  return resolve(JOBS_DIR, `${jobId}.log`);
}

function writeState(state: SyncJobState): void {
  writeFileSync(statePath(state.id), JSON.stringify(state, null, 2));
}

function readState(jobId: string): SyncJobState | null {
  // Job ids are server-generated UUIDs; reject anything else so a crafted
  // id can never traverse out of the jobs dir.
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return null;
  try {
    return JSON.parse(readFileSync(statePath(jobId), 'utf8')) as SyncJobState;
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────
// Log parsing — mirrors smarts-automation/src/orchestrator/cli.ts output
// ──────────────────────────────────────────────────────

function parseOutcomeFromLog(
  log: string,
  exitCode: number | null
): Pick<SyncJobState, 'status' | 'reason' | 'screenshots'> {
  const screenshots: SyncJobScreenshots = {
    samples: [],
    dataSummary: null,
    certification: null,
    halt: null,
  };

  const haltMatch = log.match(/^HALTED: (.*)$/m);
  const filled = /^FILLED — review package ready/m.test(log);

  for (const m of log.matchAll(/^ {4}- (\/.*\.png)$/gm)) {
    screenshots.samples.push(m[1]);
  }
  screenshots.dataSummary = log.match(/^ {2}data summary: (\/.*)$/m)?.[1] ?? null;
  screenshots.certification =
    log.match(/^ {2}certification: (\/.*)$/m)?.[1] ?? null;
  screenshots.halt = log.match(/^screenshot: (\/.*)$/m)?.[1] ?? null;

  if (filled) {
    return { status: 'filled', reason: null, screenshots };
  }
  if (haltMatch) {
    return { status: 'halted', reason: haltMatch[1], screenshots };
  }
  return {
    status: 'error',
    reason: `Bot process ended without a FILLED/HALTED result (exit code ${exitCode ?? 'unknown'}). See the run log.`,
    screenshots,
  };
}

function finalize(jobId: string, exitCode: number | null): void {
  const state = readState(jobId);
  if (!state || state.status !== 'running') return;
  let log = '';
  try {
    log = readFileSync(logPath(jobId), 'utf8');
  } catch {
    /* no log — fall through to error outcome */
  }
  const outcome = parseOutcomeFromLog(log, exitCode);
  writeState({
    ...state,
    ...outcome,
    exitCode,
    finishedAt: new Date().toISOString(),
  });
}

// ──────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────

export interface StartSyncJobInput {
  eventId: string;
  projectId: string;
  wdid: string;
  /** Must match the SMARTS Facility/Site Name (duplicate-draft guard key). */
  siteName: string;
  eventType: string;
  csv: string;
  /** Show the Chromium window on the server machine while filling. */
  headed: boolean;
}

export type StartSyncJobResult =
  | { ok: true; jobId: string }
  | { ok: false; status: 400 | 409 | 500; error: string };

export function startSyncJob(input: StartSyncJobInput): StartSyncJobResult {
  if (!smartsCredentialsConfigured()) {
    return {
      ok: false,
      status: 400,
      error:
        'SMARTS credentials are not configured on the server. Add SMARTS_USERNAME and SMARTS_PASSWORD to .env.local and restart the dev server.',
    };
  }
  if (!existsSync(BOT_DIR)) {
    return {
      ok: false,
      status: 500,
      error: `SMARTS bot not found at ${BOT_DIR}.`,
    };
  }

  const running = findRunningJobForEvent(input.eventId);
  if (running) {
    return {
      ok: false,
      status: 409,
      error: `A sync is already running for this event (job ${running.id}).`,
    };
  }

  mkdirSync(JOBS_DIR, { recursive: true });
  const jobId = randomUUID();
  const csvPath = resolve(JOBS_DIR, `${jobId}.csv`);
  writeFileSync(csvPath, input.csv);

  const tsxBin = resolve(BOT_DIR, 'node_modules', '.bin', 'tsx');
  if (!existsSync(tsxBin)) {
    return {
      ok: false,
      status: 500,
      error: `tsx runner not found (${tsxBin}) — run \`npm install\` inside smarts-automation/.`,
    };
  }

  const logFd = openSync(logPath(jobId), 'w');
  let child;
  try {
    child = spawn(tsxBin, ['src/orchestrator/cli.ts', csvPath], {
      cwd: BOT_DIR,
      env: {
        ...process.env,
        SMARTS_WDID: input.wdid,
        SMARTS_SITE_NAME: input.siteName,
        SMARTS_EVENT_TYPE: input.eventType,
        PLAYWRIGHT_HEADED: input.headed ? '1' : '',
      },
      stdio: ['ignore', logFd, logFd],
      detached: true,
    });
  } catch (e) {
    closeSync(logFd);
    return {
      ok: false,
      status: 500,
      error: `Failed to launch the bot: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    // The child holds its own copies of the fd once spawned.
    try {
      closeSync(logFd);
    } catch {
      /* already closed in the catch path */
    }
  }

  const state: SyncJobState = {
    id: jobId,
    eventId: input.eventId,
    projectId: input.projectId,
    status: 'running',
    pid: child.pid ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    reason: null,
    screenshots: { samples: [], dataSummary: null, certification: null, halt: null },
  };
  writeState(state);

  child.on('exit', (code) => finalize(jobId, code));
  child.unref();

  return { ok: true, jobId };
}

export function getSyncJob(jobId: string): SyncJobView | null {
  let state = readState(jobId);
  if (!state) return null;

  // If the dev server reloaded mid-run, our exit listener is gone. When
  // the pid is no longer alive, settle the job from its log file.
  if (state.status === 'running' && (state.pid == null || !pidAlive(state.pid))) {
    finalize(jobId, null);
    state = readState(jobId) ?? state;
  }

  let logTail: string[] = [];
  try {
    const lines = readFileSync(logPath(jobId), 'utf8').split('\n');
    logTail = lines.filter((l) => l.trim() !== '').slice(-40);
  } catch {
    /* log not written yet */
  }

  return { ...state, logTail };
}

function findRunningJobForEvent(eventId: string): SyncJobState | null {
  if (!existsSync(JOBS_DIR)) return null;
  for (const file of readdirSync(JOBS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const state = readState(file.slice(0, -'.json'.length));
    if (!state || state.eventId !== eventId || state.status !== 'running') {
      continue;
    }
    if (state.pid != null && pidAlive(state.pid)) return state;
    // Stale "running" job whose process died — settle it and keep scanning.
    finalize(state.id, null);
  }
  return null;
}

/**
 * Resolve a screenshot recorded on a job to an absolute path, refusing
 * anything outside the bot's artifacts tree (the only paths the log can
 * legitimately produce). `key` is "certification" | "dataSummary" |
 * "halt" | "sample-<n>".
 */
export function resolveJobScreenshot(
  jobId: string,
  key: string
): string | null {
  const state = readState(jobId);
  if (!state) return null;
  let path: string | null = null;
  if (key === 'certification') path = state.screenshots.certification;
  else if (key === 'dataSummary') path = state.screenshots.dataSummary;
  else if (key === 'halt') path = state.screenshots.halt;
  else {
    const m = key.match(/^sample-(\d+)$/);
    if (m) path = state.screenshots.samples[Number(m[1])] ?? null;
  }
  if (!path) return null;
  const resolved = resolve(path);
  if (!resolved.startsWith(ARTIFACTS_ROOT + '/')) return null;
  if (!resolved.endsWith('.png')) return null;
  return existsSync(resolved) ? resolved : null;
}
