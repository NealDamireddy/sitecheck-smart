/**
 * One-off verification for the monitoring-locations API logic.
 *
 * Bypasses HTTP and middleware entirely — uses the admin Supabase client
 * (same pattern as scripts/apply-migrations.ts) to exercise the same
 * Zod schemas + DB writes that the API routes use. Confirms:
 *   - the Create/Update Zod schemas accept legitimate input
 *   - the schemas reject invalid enum values
 *   - the underlying SQL works against the live DB
 *
 * Precondition: project 'demo-pleasanton' must exist and start with zero
 * monitoring_locations rows.
 *
 * Usage:
 *   npx tsx scripts/test-monitoring-locations.ts
 *
 * Exits 0 if all 7 checks pass, 1 on any failure. Leaves no rows behind.
 *
 * Relative imports (not '@/...') because tsx doesn't resolve the
 * @/ path alias — same reason apply-migrations.ts uses '../src/...'.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local BEFORE importing anything that reads process.env.
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  console.error('Missing required environment variables:');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  }
  console.error('Make sure .env.local exists at the repo root and is populated.');
  process.exit(1);
}

import { ZodError } from 'zod';
import { createAdminClient } from '../src/lib/supabase/server';
import {
  monitoringLocationCreate,
  monitoringLocationUpdate,
} from '../src/lib/validations';

const PROJECT_ID = 'demo-pleasanton';

let passed = 0;
let failed = 0;

function pass(desc: string): void {
  passed += 1;
  console.log(`✓ PASS: ${desc}`);
}

function fail(desc: string, err: unknown): void {
  failed += 1;
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`✗ FAIL: ${desc} — ${msg}`);
}

function generateId(): string {
  return `mloc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

async function main(): Promise<void> {
  console.log(`Running monitoring-locations verification for project ${PROJECT_ID}\n`);

  const supabase = createAdminClient();
  let createdId: string | null = null;

  // ──── (a) initial list — expect empty ──────────────────────────────
  try {
    const { data, error } = await supabase
      .from('monitoring_locations')
      .select('*')
      .eq('project_id', PROJECT_ID);
    if (error) throw new Error(error.message);
    const count = data?.length ?? 0;
    if (count === 0) {
      pass('(a) initial list is empty');
    } else {
      throw new Error(
        `expected 0 rows, got ${count} (ids: ${data?.map((r) => r.id).join(', ')})`
      );
    }
  } catch (err) {
    fail('(a) initial list', err);
  }

  // ──── (b) insert DP-1 via Zod parse ────────────────────────────────
  try {
    const body = monitoringLocationCreate.parse({
      projectId: PROJECT_ID,
      name: 'DP-1',
      drainageArea: 'DA-1 (5.2 ac)',
      dischargePointType: 'Effluent',
    });

    // Same snake_case conversion as the POST route handler.
    const insertRow = {
      id: generateId(),
      project_id: body.projectId,
      name: body.name,
      drainage_area: body.drainageArea,
      discharge_point_type: body.dischargePointType,
      is_ats: body.isAts ?? false,
      is_passive_treatment: body.isPassiveTreatment ?? false,
      description: body.description ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      status: body.status ?? 'active',
    };

    const { data, error } = await supabase
      .from('monitoring_locations')
      .insert(insertRow)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message ?? 'insert returned no row');

    createdId = data.id as string;
    pass(`(b) inserted DP-1 with id ${createdId}`);
  } catch (err) {
    fail('(b) insert DP-1', err);
  }

  // ──── (c) list — expect 1 row ──────────────────────────────────────
  try {
    const { data, error } = await supabase
      .from('monitoring_locations')
      .select('*')
      .eq('project_id', PROJECT_ID);
    if (error) throw new Error(error.message);
    const count = data?.length ?? 0;
    if (count === 1) {
      pass('(c) list has 1 row after insert');
    } else {
      throw new Error(`expected 1 row, got ${count}`);
    }
  } catch (err) {
    fail('(c) list after insert', err);
  }

  // ──── (d) PATCH description ────────────────────────────────────────
  if (createdId) {
    try {
      const patch = monitoringLocationUpdate.parse({
        description: 'Updated for verification',
      });

      // Same skip-empty conversion as the PATCH route handler.
      const updates: Record<string, unknown> = {};
      if (typeof patch.description === 'string' || patch.description === null) {
        updates.description = patch.description;
      }

      const { data, error } = await supabase
        .from('monitoring_locations')
        .update(updates)
        .eq('id', createdId)
        .select()
        .single();
      if (error || !data) throw new Error(error?.message ?? 'update returned no row');
      if (data.description === 'Updated for verification') {
        pass('(d) patched description');
      } else {
        throw new Error(`description not persisted, got '${data.description}'`);
      }
    } catch (err) {
      fail('(d) patch description', err);
    }
  } else {
    fail('(d) patch description', new Error('skipped — no id from step (b)'));
  }

  // ──── (e) fetch by id, verify description ──────────────────────────
  if (createdId) {
    try {
      const { data, error } = await supabase
        .from('monitoring_locations')
        .select('*')
        .eq('id', createdId)
        .single();
      if (error || !data) throw new Error(error?.message ?? 'no row');
      if (data.description === 'Updated for verification') {
        pass('(e) fetched by id, description matches');
      } else {
        throw new Error(`description mismatch: got '${data.description}'`);
      }
    } catch (err) {
      fail('(e) fetch by id', err);
    }
  } else {
    fail('(e) fetch by id', new Error('skipped — no id from step (b)'));
  }

  // ──── (f) DELETE, then list — expect empty ─────────────────────────
  if (createdId) {
    try {
      const { error: delErr } = await supabase
        .from('monitoring_locations')
        .delete()
        .eq('id', createdId);
      if (delErr) throw new Error(delErr.message);

      const { data, error } = await supabase
        .from('monitoring_locations')
        .select('*')
        .eq('project_id', PROJECT_ID);
      if (error) throw new Error(error.message);
      const count = data?.length ?? 0;
      if (count === 0) {
        pass('(f) deleted, list now empty');
      } else {
        throw new Error(`expected 0 rows after delete, got ${count}`);
      }
    } catch (err) {
      fail('(f) delete + verify empty', err);
    }
  } else {
    fail('(f) delete + verify empty', new Error('skipped — no id from step (b)'));
  }

  // ──── (g) Zod rejects invalid dischargePointType ──────────────────
  try {
    monitoringLocationCreate.parse({
      projectId: PROJECT_ID,
      name: 'DP-X',
      drainageArea: 'DA-X',
      dischargePointType: 'BadValue',
    });
    fail(
      '(g) Zod rejects bad enum',
      new Error('parse did NOT throw — schema accepted invalid enum')
    );
  } catch (err) {
    if (err instanceof ZodError) {
      pass('(g) Zod rejected dischargePointType=BadValue');
    } else {
      fail('(g) Zod rejects bad enum', err);
    }
  }

  // ──── Summary ──────────────────────────────────────────────────────
  console.log('');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error in test script:', err);
  process.exit(1);
});
