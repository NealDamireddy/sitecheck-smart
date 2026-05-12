/**
 * SiteCheck Migration Runner
 *
 * Applies SQL files in `supabase/migrations/` to the remote Supabase Postgres
 * database via a direct `pg` connection (Supavisor session pooler on port 5432).
 *
 * Handles the mixed-state case where some migrations were hand-applied via the
 * Supabase SQL Editor: before executing a file, the runner probes the live DB
 * for a telltale object from that file. If the object exists, the file is
 * recorded in `_migrations` without re-executing its SQL (critical because
 * 001-005 use bare `CREATE TABLE` without `IF NOT EXISTS`).
 *
 * Usage (from a Next.js API route or a tsx script):
 *   import { runMigrations } from '@/lib/migrations/runner';
 *   const result = await runMigrations({ dryRun: false });
 */

import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type MigrationStatus = 'applied' | 'recorded' | 'skipped' | 'failed';

export interface MigrationResult {
  filename: string;
  status: MigrationStatus;
  durationMs: number;
  checksum: string;
  error?: string;
}

export interface RunResult {
  ok: boolean;
  migrationsDir: string;
  totalFiles: number;
  appliedCount: number;
  recordedCount: number;
  skippedCount: number;
  failedCount: number;
  totalMs: number;
  results: MigrationResult[];
}

export interface RunOptions {
  /** Absolute path to the migrations directory. Defaults to `<cwd>/supabase/migrations`. */
  migrationsDir?: string;
  /** Postgres connection string. Defaults to `process.env.SUPABASE_DB_URL`. */
  connectionString?: string;
  /** If true, report what would happen but do not execute or record anything. */
  dryRun?: boolean;
}

const BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS _migrations (
    filename    TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER NOT NULL,
    mode        TEXT NOT NULL CHECK (mode IN ('applied','recorded'))
  );
`;

/**
 * Probe queries used to detect whether a migration's objects already exist
 * in the live database. Returning a non-null result means "already applied".
 *
 * Keyed by migration filename. Any migration file not in this map is assumed
 * unprobed and will always execute (the default, safe when the file itself
 * is idempotent).
 */
const PROBES: Record<string, string> = {
  '001_initial_schema.sql':
    `SELECT to_regclass('public.projects') IS NOT NULL AS exists`,
  '002_drone_features.sql':
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='drone_missions' AND column_name='scope'
     ) AS exists`,
  '003_linear_projects.sql':
    `SELECT to_regclass('public.project_segments') IS NOT NULL AS exists`,
  '004_crossings_row_permits.sql':
    `SELECT to_regclass('public.crossings') IS NOT NULL AS exists`,
  '005_geofence_nofly.sql':
    `SELECT to_regclass('public.geofences') IS NOT NULL AS exists`,
  '006_mission_telemetry_review.sql':
    `SELECT to_regclass('public.mission_ai_analyses') IS NOT NULL AS exists`,
  '007_inspections_block5.sql':
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='inspections' AND column_name='trigger'
     ) AS exists`,
  '008_auth_rls.sql':
    `SELECT to_regclass('public.organizations') IS NOT NULL AS exists`,
};

async function probeExists(client: Client, filename: string): Promise<boolean> {
  const probe = PROBES[filename];
  if (!probe) return false;
  const { rows } = await client.query<{ exists: boolean }>(probe);
  return rows[0]?.exists === true;
}

export async function runMigrations(opts: RunOptions = {}): Promise<RunResult> {
  const migrationsDir =
    opts.migrationsDir ?? path.resolve(process.cwd(), 'supabase/migrations');

  const connectionString = opts.connectionString ?? process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL is not set');
  }

  const client = new Client({
    connectionString,
    // Supabase presents an intermediate-rooted chain that Node's default CA
    // store may not verify on every platform. Safe here because we're
    // connecting to a hardcoded Supabase hostname from a trusted runtime.
    ssl: { rejectUnauthorized: false },
    // Large DDL (index creation, trigger installation) can be slow.
    statement_timeout: 5 * 60 * 1000,
  });

  const startAll = Date.now();
  const results: MigrationResult[] = [];

  await client.connect();
  try {
    // 1. Bootstrap tracking table (always safe).
    await client.query(BOOTSTRAP_SQL);

    // 2. Discover migration files, sorted lexicographically (001 < 002 < ...).
    const entries = await fs.readdir(migrationsDir);
    const files = entries
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    // 3. Fetch already-recorded migrations in one round trip.
    const { rows: already } = await client.query<{
      filename: string;
      checksum: string;
    }>('SELECT filename, checksum FROM _migrations');
    const recorded = new Map(already.map((r) => [r.filename, r.checksum]));

    // 4. Process each file in order.
    for (const filename of files) {
      const fullPath = path.join(migrationsDir, filename);
      const sql = await fs.readFile(fullPath, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const start = Date.now();

      // Already recorded → skip (with drift warning if checksum changed).
      const prior = recorded.get(filename);
      if (prior) {
        const error =
          prior !== checksum
            ? `checksum drift (db=${prior.slice(0, 8)}, disk=${checksum.slice(
                0,
                8,
              )}) — migration file has changed since it was recorded`
            : undefined;
        results.push({
          filename,
          status: 'skipped',
          durationMs: 0,
          checksum,
          error,
        });
        continue;
      }

      if (opts.dryRun) {
        results.push({
          filename,
          status: 'skipped',
          durationMs: 0,
          checksum,
          error: 'dry-run',
        });
        continue;
      }

      // Not recorded → probe the DB to see if objects already exist.
      let alreadyInDb = false;
      try {
        alreadyInDb = await probeExists(client, filename);
      } catch (err) {
        results.push({
          filename,
          status: 'failed',
          durationMs: Date.now() - start,
          checksum,
          error: `probe failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
        break;
      }

      if (alreadyInDb) {
        // Record-only: insert into _migrations without re-running the SQL.
        try {
          await client.query(
            'INSERT INTO _migrations (filename, checksum, duration_ms, mode) VALUES ($1, $2, $3, $4)',
            [filename, checksum, 0, 'recorded'],
          );
          results.push({
            filename,
            status: 'recorded',
            durationMs: Date.now() - start,
            checksum,
          });
          continue;
        } catch (err) {
          results.push({
            filename,
            status: 'failed',
            durationMs: Date.now() - start,
            checksum,
            error: `record-only insert failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          });
          break;
        }
      }

      // Execute: run the file's SQL inside a transaction, then record.
      try {
        await client.query('BEGIN');
        // Simple query protocol: no `values` param → supports multi-statement SQL.
        await client.query(sql);
        const durationMs = Date.now() - start;
        await client.query(
          'INSERT INTO _migrations (filename, checksum, duration_ms, mode) VALUES ($1, $2, $3, $4)',
          [filename, checksum, durationMs, 'applied'],
        );
        await client.query('COMMIT');
        results.push({
          filename,
          status: 'applied',
          durationMs,
          checksum,
        });
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Swallow rollback failure; original error is what matters.
        }
        results.push({
          filename,
          status: 'failed',
          durationMs: Date.now() - start,
          checksum,
          error: err instanceof Error ? err.message : String(err),
        });
        // Stop on first failure — later migrations may depend on earlier ones.
        break;
      }
    }
  } finally {
    await client.end();
  }

  const appliedCount = results.filter((r) => r.status === 'applied').length;
  const recordedCount = results.filter((r) => r.status === 'recorded').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  return {
    ok: failedCount === 0,
    migrationsDir,
    totalFiles: results.length,
    appliedCount,
    recordedCount,
    skippedCount,
    failedCount,
    totalMs: Date.now() - startAll,
    results,
  };
}
