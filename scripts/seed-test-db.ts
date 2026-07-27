/**
 * Seed a DISPOSABLE Supabase project with deterministic E2E fixtures.
 *
 *   npx tsx scripts/seed-test-db.ts
 *
 * Creates two isolated inspectors, each in their own organization
 * (the signup trigger from migration 012 provisions the org), each with
 * one project, checkpoints, a completed inspection, and a SMARTS event
 * whose samples include one reading within NAL and one exceeding it.
 * The pair is what the isolation specs need: User B must never be able
 * to see any of User A's rows.
 *
 * REQUIRED ENV (deliberately distinct names — this script refuses to
 * run against the variables the app itself uses, so it cannot be
 * pointed at production by accident):
 *
 *   E2E_SUPABASE_URL              disposable project URL
 *   E2E_SUPABASE_SERVICE_ROLE_KEY its service-role key
 *   E2E_USER_A_EMAIL / _PASSWORD
 *   E2E_USER_B_EMAIL / _PASSWORD
 *
 * Prints the ids the specs need (E2E_USER_A_PROJECT_ID).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env.test'), override: true });

const URL = process.env.E2E_SUPABASE_URL;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

function die(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!URL || !SERVICE_KEY) {
  die(
    'E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY are required.\n' +
      '  These are intentionally NOT the app\'s own SUPABASE_* variables: this\n' +
      '  script writes and deletes data, so it must be pointed at a throwaway\n' +
      '  project explicitly. Create one at supabase.com, apply\n' +
      '  supabase/migrations/*.sql to it, then set these in .env.test.'
  );
}
if (URL === process.env.NEXT_PUBLIC_SUPABASE_URL) {
  die(
    `E2E_SUPABASE_URL equals NEXT_PUBLIC_SUPABASE_URL (${URL}).\n` +
      '  Refusing to seed what may be your real database.'
  );
}

const admin: SupabaseClient = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface SeededUser {
  label: 'A' | 'B';
  id: string;
  email: string;
  projectId: string;
}

async function ensureUser(label: 'A' | 'B'): Promise<{ id: string; email: string }> {
  const email = process.env[`E2E_USER_${label}_EMAIL`];
  const password = process.env[`E2E_USER_${label}_PASSWORD`];
  if (!email || !password) {
    die(`E2E_USER_${label}_EMAIL and E2E_USER_${label}_PASSWORD are required.`);
  }

  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === email);
  if (found) {
    console.log(`  user ${label}: reusing ${email}`);
    return { id: found.id, email };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { org_name: `E2E Org ${label}` },
  });
  if (error || !data.user) die(`Could not create user ${label}: ${error?.message}`);
  console.log(`  user ${label}: created ${email}`);
  return { id: data.user.id, email };
}

async function orgIdFor(userId: string): Promise<string> {
  const { data } = await admin
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data?.org_id) {
    die(
      `No org membership for ${userId}. Migration 012 (signup trigger) must be ` +
        'applied to the test project.'
    );
  }
  return data.org_id as string;
}

async function seedProject(user: { id: string; email: string }, label: 'A' | 'B') {
  const orgId = await orgIdFor(user.id);
  const projectId = `e2e-project-${label.toLowerCase()}`;

  await admin.from('projects').upsert({
    id: projectId,
    org_id: orgId,
    name: `User ${label} Test Site`,
    address: `${label === 'A' ? '100' : '200'} Test Road, Fresno, CA`,
    permit_number: `CAS000002-${label}`,
    wdid: `5S34C${label === 'A' ? '111111' : '222222'}`,
    risk_level: 2,
    qsp_name: `Inspector ${label}`,
    qsp_license_number: `QSD-0000${label === 'A' ? '1' : '2'}`,
    qsp_company: `Firm ${label}`,
    qsp_phone: '555-0100',
    qsp_email: user.email,
    status: 'active',
    start_date: '2026-01-01',
    estimated_completion: '2026-12-31',
    acreage: 12.5,
    center_lat: 36.7801,
    center_lng: -119.4161,
    project_type: 'bounded-site',
  });

  const checkpoints = [
    { id: `e2e-cp-${label}-1`, name: 'SC-1 — Silt Fence North', bmp_type: 'sediment-control', zone: 'north' },
    { id: `e2e-cp-${label}-2`, name: 'EC-1 — Hydroseed Slope', bmp_type: 'erosion-control', zone: 'south' },
    { id: `e2e-cp-${label}-3`, name: 'TC-1 — Stabilized Entrance', bmp_type: 'tracking-control', zone: 'east' },
  ];
  for (const cp of checkpoints) {
    await admin.from('checkpoints').upsert({
      ...cp,
      project_id: projectId,
      status: 'needs-review',
      priority: 'medium',
      description: `${cp.name} seeded for E2E`,
      cgp_section: 'Section X.H.1.a',
      lat: 36.7805,
      lng: -119.4165,
      install_date: '2026-01-05',
      swppp_page: 1,
    });
  }

  const inspectionId = `e2e-insp-${label}`;
  await admin.from('inspections').upsert({
    id: inspectionId,
    project_id: projectId,
    date: '2026-02-01T17:00:00.000Z',
    type: 'routine',
    inspector: `Inspector ${label}`,
    weather_temperature: 62,
    weather_condition: 'clear',
    weather_wind_speed_mph: 5,
    weather_humidity: 40,
    overall_compliance: 92,
    trigger: 'routine',
    status: 'submitted',
  });

  const locationId = `e2e-loc-${label}`;
  await admin.from('monitoring_locations').upsert({
    id: locationId,
    project_id: projectId,
    name: `DP-1 ${label}`, // ≤25 chars per SMARTS
    drainage_area: 'DA-1',
    discharge_point_type: 'Effluent',
    status: 'active',
  });

  const eventId = `e2e-evt-${label}`;
  await admin.from('smarts_events').upsert({
    id: eventId,
    project_id: projectId,
    status: 'ended',
    source: 'simulated',
    forecast_detected_at: '2026-02-05T00:00:00.000Z',
    started_at: '2026-02-05T12:00:00.000Z',
    ended_at: '2026-02-05T20:00:00.000Z',
    precipitation_inches: 0.75,
  });

  const sampleId = `e2e-sample-${label}`;
  await admin.from('samples').upsert({
    id: sampleId,
    project_id: projectId,
    smarts_event_id: eventId,
    monitoring_location_id: locationId,
    sample_datetime: '2026-02-05T18:00:00.000Z',
    qsp_name: `Inspector ${label}`,
  });

  // One reading inside the NAL, one exceeding it — the review surface
  // and the export must both distinguish them.
  await admin.from('parameter_results').upsert([
    {
      id: `e2e-pr-${label}-ph`,
      project_id: projectId,
      sample_id: sampleId,
      parameter: 'pH',
      qualifier: '=',
      result: 7.4,
      units: 'SU',
      analytical_method: 'pH_field',
      analyzed_by: 'Self',
    },
    {
      id: `e2e-pr-${label}-turb`,
      project_id: projectId,
      sample_id: sampleId,
      parameter: 'Turbidity',
      qualifier: '=',
      result: 310, // > 250 NTU NAL
      units: 'NTU',
      analytical_method: 'EPA 180.1',
      analyzed_by: 'Self',
    },
  ]);

  console.log(`  project ${label}: ${projectId} (3 checkpoints, 1 inspection, 1 event, 1 sample)`);
  return projectId;
}

async function main() {
  console.log(`\nSeeding test data into ${URL}\n`);
  const seeded: SeededUser[] = [];
  for (const label of ['A', 'B'] as const) {
    const user = await ensureUser(label);
    const projectId = await seedProject(user, label);
    seeded.push({ label, id: user.id, email: user.email, projectId });
  }

  console.log('\n✔ Seed complete. Add to .env.test:\n');
  for (const s of seeded) {
    console.log(`  E2E_USER_${s.label}_PROJECT_ID=${s.projectId}`);
  }
  console.log('\nThen: npm run test:e2e\n');
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
