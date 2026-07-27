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
 * Credentials are resolved by the caller (per-inspector saved
 * credentials, decrypted server-side — see lib/smarts/credentials.ts —
 * or the server-env fallback) and passed to the child via env. They
 * never transit the browser and are never written to the job files.
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
import {
  recordRunStart,
  recordRunFinalize,
  toRunAuditStatus,
} from '@/lib/smarts/run-audit';
import { log } from '@/lib/logger';

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
  /** Owning user — persisted so the audit row can be written from the
   * detached child's exit listener, which has no request context. */
  userId: string;
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

/**
 * SECOND, independent certification hard-stop guard (additive — the
 * orchestrator already never clicks Certify/checks the attestation/submits;
 * see the INVARIANT header in run-fill.ts). These markers describe an
 * AFFIRMATIVE certified/submitted state that the bot must NEVER report.
 * They are deliberately specific so they cannot match the clean output,
 * which legitimately contains "review package ready for human certification",
 * "certification: <screenshot>", and "a human must click Certify".
 * If any matches, the run is rejected as an error regardless of FILLED.
 */
const CERTIFICATION_BREACH_MARKERS: readonly RegExp[] = [
  /\bCERTIFIED\b/,
  /\bSUBMITTED\b/,
  /report (?:was )?(?:certified|submitted)/i,
  /successfully (?:certified|submitted)/i,
  /certification (?:complete|completed|submitted|successful)/i,
  /clicked (?:the )?certif/i,
  /attestation (?:checkbox )?(?:checked|accepted|ticked)/i,
];

function detectCertificationBreach(log: string): boolean {
  return CERTIFICATION_BREACH_MARKERS.some((re) => re.test(log));
}

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

  // Hard-stop guard (overrides everything, including FILLED): the bot must
  // never reach a certified/submitted state. If the log says it did, the
  // automation has been tampered with — reject the run.
  if (detectCertificationBreach(log)) {
    return {
      status: 'error',
      reason:
        'Certification hard-stop: the run reported a certified/submitted state, which the bot must never do. Run rejected — review and certify manually in SMARTS.',
      screenshots,
    };
  }

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

/**
 * Best-effort human-readable "furthest step reached", derived from the
 * orchestrator's stdout. Used for the audit row + run-status UI; never
 * drives control flow.
 */
function deriveLastStep(
  log: string,
  outcomeStatus: SyncJobStatus
): string | null {
  if (outcomeStatus === 'filled') return 'Filled — stopped before certification';
  const samples = [...log.matchAll(/^sample-(\d+)\.png saved/gm)];
  if (/^HALTED:/m.test(log)) {
    if (/Certification/m.test(log)) return 'Halted at Certification';
    if (/Data Summary/m.test(log)) return 'Halted at Data Summary';
    if (samples.length > 0) return `Halted at Raw Data (sample ${samples.length})`;
    if (/Event Information|halt-event-info/m.test(log)) return 'Halted at Event Information';
    if (/halt-nav-project/m.test(log)) return 'Halted navigating to project';
    return 'Halted';
  }
  return null;
}

async function finalize(jobId: string, exitCode: number | null): Promise<void> {
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

  // Durable audit (LEGAL INVARIANT for the 'filled' path: persist
  // 'stopped_before_cert' before returning). Awaited; never throws.
  await recordRunFinalize({
    jobId,
    status: toRunAuditStatus(outcome.status),
    lastStepReached: deriveLastStep(log, outcome.status),
    errorMessage: outcome.status === 'filled' ? null : outcome.reason,
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
  /** Resolved SMARTS login — env-passed to the child, never persisted. */
  username: string;
  password: string;
  /** Owning user, for the durable run-audit row. */
  userId: string;
}

export type StartSyncJobResult =
  | { ok: true; jobId: string }
  | { ok: false; status: 400 | 409 | 500; error: string };

export async function startSyncJob(
  input: StartSyncJobInput
): Promise<StartSyncJobResult> {
  if (!input.username.trim() || !input.password) {
    return {
      ok: false,
      status: 400,
      error:
        'No SMARTS credentials available. Save your SMARTS username and password on the My Account page.',
    };
  }
  if (!existsSync(BOT_DIR)) {
    return {
      ok: false,
      status: 500,
      error: `SMARTS bot not found at ${BOT_DIR}.`,
    };
  }

  const running = await findRunningJobForEvent(input.eventId);
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
        // Explicit override — a stale server-env pair must never shadow
        // the per-inspector credentials resolved for this run.
        SMARTS_USERNAME: input.username,
        SMARTS_PASSWORD: input.password,
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
    userId: input.userId,
    status: 'running',
    pid: child.pid ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    reason: null,
    screenshots: { samples: [], dataSummary: null, certification: null, halt: null },
  };
  writeState(state);

  // Durable audit: 'running' row at spawn time. Awaited so the row exists
  // before the finalize update can race it; never throws.
  await recordRunStart({
    jobId,
    userId: input.userId,
    projectId: input.projectId,
    wdid: input.wdid,
    csvText: input.csv,
  });

  child.on('exit', (code) => {
    finalize(jobId, code).catch((err) =>
      log.error('sync-job finalize failed on child exit', { jobId, err })
    );
  });
  child.unref();

  return { ok: true, jobId };
}

export async function getSyncJob(jobId: string): Promise<SyncJobView | null> {
  let state = readState(jobId);
  if (!state) return null;

  // If the dev server reloaded mid-run, our exit listener is gone. When
  // the pid is no longer alive, settle the job from its log file.
  if (state.status === 'running' && (state.pid == null || !pidAlive(state.pid))) {
    await finalize(jobId, null);
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

async function findRunningJobForEvent(
  eventId: string
): Promise<SyncJobState | null> {
  if (!existsSync(JOBS_DIR)) return null;
  for (const file of readdirSync(JOBS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const state = readState(file.slice(0, -'.json'.length));
    if (!state || state.eventId !== eventId || state.status !== 'running') {
      continue;
    }
    if (state.pid != null && pidAlive(state.pid)) return state;
    // Stale "running" job whose process died — settle it and keep scanning.
    await finalize(state.id, null);
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
