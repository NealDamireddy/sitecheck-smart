/**
 * SiteCheck Migration Runner (standalone)
 *
 * Applies SQL files in `supabase/migrations/` directly via the same runner
 * used by the /api/admin/apply-migrations route. No dev server required.
 *
 * Usage:
 *   npm run db:migrate          # apply pending migrations
 *   npm run db:migrate:dry      # report what would run, make no changes
 *
 * Required env vars (loaded from .env.local):
 *   SUPABASE_DB_URL             Supavisor session pooler URL (port 5432)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local before importing anything that reads process.env.
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { runMigrations } from '../src/lib/migrations/runner';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('[migrate] dry-run mode: no changes will be written');
  }

  const result = await runMigrations({ dryRun });

  console.log(JSON.stringify(result, null, 2));

  const summary = [
    `applied=${result.appliedCount}`,
    `recorded=${result.recordedCount}`,
    `skipped=${result.skippedCount}`,
    `failed=${result.failedCount}`,
    `total=${result.totalFiles}`,
    `ms=${result.totalMs}`,
  ].join(' ');

  if (result.ok) {
    console.log(`[migrate] OK  ${summary}`);
    process.exit(0);
  } else {
    console.error(`[migrate] FAIL  ${summary}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[migrate] fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
