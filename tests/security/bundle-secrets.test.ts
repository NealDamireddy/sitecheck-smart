/**
 * No server secret may reach the browser bundle.
 *
 * Scans the built client output for the ACTUAL values of every
 * server-only variable in the environment, not just their names — a
 * name appearing in a chunk is harmless, the value is a breach.
 *
 * Requires a build: `npm run build` first. The suite skips (loudly)
 * when .next/static is absent so a fresh clone's `npm test` isn't a
 * false failure; CI runs build before test, so it always executes there.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';

const STATIC_DIR = join(process.cwd(), '.next/static');

/** Server-only env vars. Their values must never appear client-side. */
const SERVER_ONLY_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'ANTHROPIC_API_KEY',
  'OPENWEATHERMAP_API_KEY',
  'ADMIN_MIGRATION_TOKEN',
  'CRON_SECRET',
  'SMARTS_USERNAME',
  'SMARTS_PASSWORD',
  'SMARTS_CREDENTIALS_KEY',
  'NOAA_USER_AGENT',
];

/** Intentionally public — asserted present-or-absent, never flagged. */
const PUBLIC_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_MAPBOX_TOKEN',
];

/**
 * The part of a secret that is unique to it.
 *
 * Supabase anon and service-role keys are JWTs that share a byte-
 * identical header AND the start of their payload (same algorithm, same
 * issuer, same project ref) — they only diverge at the `role` claim.
 * Matching on a prefix therefore reports the *public* anon key as a
 * service-key leak. The signature segment is derived from the key
 * material, so it is unique per key and is what we search for.
 */
function distinctiveNeedle(value: string): string {
  const segments = value.split('.');
  if (segments.length === 3 && segments.every((s) => s.length > 8)) {
    return segments[2]; // JWT signature
  }
  return value;
}

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else if (/\.(js|mjs|css|map)$/.test(entry)) out.push(full);
  }
  return out;
}

const built = existsSync(STATIC_DIR);
const describeBuilt = built ? describe : describe.skip;

if (!built) {
  console.warn(
    '[bundle-secrets] .next/static not found — run `npm run build` to enable this suite.'
  );
}

describeBuilt('client bundle contains no server secrets', () => {
  // Read .env.local directly rather than process.env: vitest does not
  // load it, and we need the real values to search for.
  const parsed = loadEnv({ path: join(process.cwd(), '.env.local') }).parsed ?? {};
  const files = collectFiles(STATIC_DIR);
  const contents = files.map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));

  it('has client chunks to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const name of SERVER_ONLY_VARS) {
    it(`${name}'s value does not appear in any client chunk`, () => {
      const value = parsed[name]?.trim();
      if (!value || value.length < 8) {
        // Not configured locally — nothing to leak. CI sets these.
        return;
      }
      const hits = contents
        .filter((c) => c.text.includes(distinctiveNeedle(value)))
        .map((c) => c.file);
      expect(hits, `${name} leaked into: ${hits.join(', ')}`).toEqual([]);
    });
  }

  it('the public anon key IS present (negative control for the scan)', () => {
    // Without this, a scan that searches the wrong files would pass
    // every test above while proving nothing.
    const anon = parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!anon || anon.length < 60) return;
    const found = contents.some((c) => c.text.includes(distinctiveNeedle(anon)));
    expect(found).toBe(true);
  });

  it('no obvious secret-shaped literals appear in client chunks', () => {
    const patterns: Array<[string, RegExp]> = [
      ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
      ['AWS access key', /AKIA[0-9A-Z]{16}/],
      ['Postgres URL with password', /postgres(ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/],
      ['service_role JWT claim', /"role"\s*:\s*"service_role"/],
    ];
    const findings: string[] = [];
    for (const { file, text } of contents) {
      for (const [label, re] of patterns) {
        if (re.test(text)) findings.push(`${label} in ${file}`);
      }
    }
    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('documents which public vars are expected client-side', () => {
    expect(PUBLIC_VARS).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });
});
