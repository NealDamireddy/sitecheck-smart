/**
 * The manifest must describe reality.
 *
 * A new API route that nobody classified — or a route that quietly
 * drops requireAuth — fails here. This is the tripwire that keeps the
 * rest of the security suite honest as the codebase grows.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROUTES, type Verb } from '../support/route-manifest';

const API_ROOT = join(process.cwd(), 'src/app/api');
const VERBS: Verb[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findRouteFiles(full));
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

const onDisk = findRouteFiles(API_ROOT).map((f) =>
  relative(join(process.cwd(), 'src/app'), f)
);

describe('route manifest completeness', () => {
  it('every route file on disk is classified in the manifest', () => {
    const declared = new Set(ROUTES.map((r) => r.file));
    const unclassified = onDisk.filter((f) => !declared.has(f));
    expect(
      unclassified,
      `Unclassified API routes — add them to tests/support/route-manifest.ts ` +
        `with a scope and auth model:\n${unclassified.join('\n')}`
    ).toEqual([]);
  });

  it('every manifest entry still exists on disk', () => {
    const actual = new Set(onDisk);
    const stale = ROUTES.filter((r) => !actual.has(r.file)).map((r) => r.file);
    expect(stale, `Manifest lists routes that no longer exist:\n${stale.join('\n')}`).toEqual([]);
  });

  it('declared verbs match the handlers each file exports', () => {
    const mismatches: string[] = [];
    for (const route of ROUTES) {
      const src = readFileSync(join(process.cwd(), 'src/app', route.file), 'utf8');
      const exported = VERBS.filter((v) =>
        new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b`).test(src)
      );
      const declared = [...route.verbs].sort().join(',');
      const found = [...exported].sort().join(',');
      if (declared !== found) {
        mismatches.push(`${route.file}: manifest=[${declared}] code=[${found}]`);
      }
    }
    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });
});

describe('authentication coverage', () => {
  it('every user-facing route calls requireAuth()', () => {
    const missing: string[] = [];
    for (const route of ROUTES.filter((r) => r.auth === 'user')) {
      const src = readFileSync(join(process.cwd(), 'src/app', route.file), 'utf8');
      if (!/requireAuth\s*\(/.test(src)) missing.push(route.file);
    }
    expect(
      missing,
      `Routes classified auth:'user' that never call requireAuth():\n${missing.join('\n')}`
    ).toEqual([]);
  });

  it('every non-user-auth route carries a written justification', () => {
    for (const route of ROUTES.filter((r) => r.auth !== 'user')) {
      expect(route.why, `${route.file} needs a \`why\``).toBeTruthy();
      expect(route.why!.length).toBeGreaterThan(40);
    }
  });

  it('the auth exception list has not grown', () => {
    // Any addition here is a deliberate security decision that must be
    // reviewed — not something a routine PR should be able to slip in.
    const exceptions = ROUTES.filter((r) => r.auth !== 'user').map((r) => r.path).sort();
    expect(exceptions).toEqual([
      '/api/admin/apply-migrations',
      '/api/cron/pre-storm-detector',
      '/api/health',
      '/api/weather/noaa',
    ]);
  });
});

describe('service-role usage', () => {
  it('no user-facing route imports the RLS-bypassing admin client', () => {
    const offenders: string[] = [];
    for (const route of ROUTES.filter((r) => r.auth === 'user')) {
      const src = readFileSync(join(process.cwd(), 'src/app', route.file), 'utf8');
      if (/createAdminClient/.test(src)) offenders.push(route.file);
    }
    expect(
      offenders,
      `User-facing routes must query through the caller's RLS-scoped client:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('the deprecated createServerClient() alias stays deleted (SEC-04)', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/supabase/server.ts'), 'utf8');
    expect(src).not.toMatch(/export\s+function\s+createServerClient/);
  });
});
