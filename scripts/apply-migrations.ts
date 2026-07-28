/**
 * SiteCheck Migration Runner (standalone)
 *
 * Applies SQL files in `supabase/migrations/` directly via the same runner
 * used by the /api/admin/apply-migrations route. No dev server required.
 *
 * Usage:
 *   npm run db:migrate                          # apply to .env.local's DB
 *   npm run db:migrate:dry                      # report only, no changes
 *   npm run db:migrate -- --env=.env.test       # apply to the test project
 *
 * Env (from the chosen env file):
 *   SUPABASE_DB_URL             Supavisor session pooler URL (port 5432)
 *
 * SAFETY: this script writes schema to whatever database SUPABASE_DB_URL
 * names. It therefore always prints the target host and refuses to touch
 * a database whose host it cannot identify. Use --env rather than
 * editing .env.local to point at a test project: a temporarily-edited
 * .env.local that nobody changes back is how production gets migrated by
 * accident.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as readline from 'node:readline/promises';

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

const envFile = argValue('--env') ?? '.env.local';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

import { runMigrations } from '../src/lib/migrations/runner';

/** Host of the target DB, for the confirmation banner. */
function targetHost(connectionString: string | undefined): string | null {
  if (!connectionString) return null;
  try {
    return new URL(connectionString).host;
  } catch {
    return null;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const assumeYes = process.argv.includes('--yes') || process.env.CI === 'true';

  const host = targetHost(process.env.SUPABASE_DB_URL);
  if (!host) {
    console.error(
      `[migrate] SUPABASE_DB_URL is missing or unparseable in ${envFile}.\n` +
        '          Set it to the Supavisor session pooler URL (port 5432).'
    );
    process.exit(1);
  }

  console.log('');
  console.log('  ┌──────────────────────────────────────────────────────');
  console.log(`  │ env file : ${envFile}`);
  console.log(`  │ database : ${host}`);
  console.log(`  │ mode     : ${dryRun ? 'DRY RUN (no changes)' : 'APPLY — writes schema'}`);
  console.log('  └──────────────────────────────────────────────────────');
  console.log('');

  // A dry run changes nothing, and CI has no TTY — only a real apply
  // from an interactive shell needs the confirmation.
  if (!dryRun && !assumeYes && process.stdin.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await rl.question(
      `  Apply migrations to "${host}"? Type the host to confirm: `
    );
    rl.close();
    if (answer.trim() !== host) {
      console.error('[migrate] aborted — host did not match.');
      process.exit(1);
    }
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
    console.log(`[migrate] OK  ${summary}  → ${host}`);
    process.exit(0);
  } else {
    console.error(`[migrate] FAIL  ${summary}  → ${host}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[migrate] fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
