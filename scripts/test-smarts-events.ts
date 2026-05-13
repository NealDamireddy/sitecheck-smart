/**
 * One-off verification for the smarts-events API logic + Zod schemas +
 * the /simulate insert-only contract.
 *
 * Bypasses HTTP via the admin Supabase client (same pattern as
 * scripts/apply-migrations.ts and the other test-* scripts). Mimics the
 * exact same Zod parse + snake_case + insert logic the API routes use.
 *
 * Precondition: project 'demo-pleasanton' exists. The script doesn't
 * require zero existing smarts_events rows — it captures a baseline
 * count in step (a) and checks deltas, so it's safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/test-smarts-events.ts
 *
 * Exits 0 if all 13 checks pass, 1 on any failure. Leaves no rows behind.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

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
  process.exit(1);
}

import { ZodError } from 'zod';
import { createAdminClient } from '../src/lib/supabase/server';
import {
  smartsEventCreate,
  smartsEventUpdate,
  smartsEventSimulate,
} from '../src/lib/validations';

const PROJECT_ID = 'demo-pleasanton';

// Keep in sync with SIMULATED_FORECAST_PRECIP_INCHES in
// src/app/api/smarts-events/simulate/route.ts. If you change one, change the other.
const SIMULATED_FORECAST_PRECIP_INCHES = 0.7;

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
  return `smarts-evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

async function main(): Promise<void> {
  console.log(`Running smarts-events verification for project ${PROJECT_ID}\n`);

  const supabase = createAdminClient();

  let baselineCount = 0;
  let createdEventId: string | null = null;
  let simulatedForecastId: string | null = null;
  let simulatedStartingId: string | null = null;

  // ──── (a) baseline list ───────────────────────────────────────────
  try {
    const { data, error } = await supabase
      .from('smarts_events')
      .select('id')
      .eq('project_id', PROJECT_ID);
    if (error) throw new Error(error.message);
    baselineCount = data?.length ?? 0;
    pass(`(a) baseline list captured — ${baselineCount} existing rows`);
  } catch (err) {
    fail('(a) baseline list', err);
  }

  // ──── (b) POST manual create ──────────────────────────────────────
  try {
    const body = smartsEventCreate.parse({
      projectId: PROJECT_ID,
      status: 'forecast',
      source: 'noaa',
      notes: 'test-smarts-events.ts manual create',
    });

    // Same logic as src/app/api/smarts-events/route.ts POST.
    const insertRow = {
      id: body.id || generateId(),
      project_id: body.projectId,
      status: body.status ?? 'forecast',
      source: body.source ?? 'noaa',
      forecast_detected_at: body.forecastDetectedAt ?? new Date().toISOString(),
      started_at: body.startedAt ?? null,
      ended_at: body.endedAt ?? null,
      precipitation_inches: body.precipitationInches ?? null,
      notes: body.notes ?? null,
    };

    const { data, error } = await supabase
      .from('smarts_events')
      .insert(insertRow)
      .select()
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? 'insert returned no row');
    }

    createdEventId = data.id as string;
    if (data.status !== 'forecast') {
      throw new Error(`status not 'forecast', got '${data.status}'`);
    }
    pass(`(b) POST manual create — id ${createdEventId}, status='forecast'`);
  } catch (err) {
    fail('(b) POST manual create', err);
  }

  // ──── (c) GET single by id ────────────────────────────────────────
  if (createdEventId) {
    try {
      const { data, error } = await supabase
        .from('smarts_events')
        .select('*')
        .eq('id', createdEventId)
        .single();
      if (error || !data) {
        throw new Error(error?.message ?? 'no row');
      }
      if (data.id !== createdEventId) {
        throw new Error(`id mismatch: ${data.id}`);
      }
      if (data.source !== 'noaa') {
        throw new Error(`source mismatch: got '${data.source}'`);
      }
      pass(`(c) GET single by id matches`);
    } catch (err) {
      fail('(c) GET single by id', err);
    }
  } else {
    fail('(c) GET single by id', new Error('skipped — no id from step (b)'));
  }

  // ──── (d) list = baseline + 1 ─────────────────────────────────────
  try {
    const { data, error } = await supabase
      .from('smarts_events')
      .select('id')
      .eq('project_id', PROJECT_ID);
    if (error) throw new Error(error.message);
    const count = data?.length ?? 0;
    if (count !== baselineCount + 1) {
      throw new Error(
        `expected ${baselineCount + 1} rows, got ${count}`
      );
    }
    pass(`(d) list has baseline+1 = ${baselineCount + 1} rows`);
  } catch (err) {
    fail('(d) list after create', err);
  }

  // ──── (e) PATCH status to 'active' ────────────────────────────────
  if (createdEventId) {
    try {
      const patch = smartsEventUpdate.parse({ status: 'active' });
      const updates: Record<string, unknown> = {};
      if (typeof patch.status === 'string') updates.status = patch.status;

      const { data, error } = await supabase
        .from('smarts_events')
        .update(updates)
        .eq('id', createdEventId)
        .select()
        .single();
      if (error || !data) {
        throw new Error(error?.message ?? 'update returned no row');
      }
      if (data.status !== 'active') {
        throw new Error(`status not 'active', got '${data.status}'`);
      }
      pass('(e) PATCH status to active');
    } catch (err) {
      fail('(e) PATCH status to active', err);
    }
  } else {
    fail('(e) PATCH status to active', new Error('skipped — no id from step (b)'));
  }

  // ──── (f) PATCH with unknown-key garbage; Zod strips, state unchanged ─
  // Mirrors test-samples step (g2): documents that smartsEventUpdate
  // silently strips unknown keys. If anyone later adds e.g. `mode` to
  // smartsEventUpdate, the parsed-record check fires immediately.
  if (createdEventId) {
    try {
      const patch = smartsEventUpdate.parse({
        // No legitimate field — intentional, to exercise the strip path.
        mode: 'starting',
        bogusKey: { nested: 'whatever' },
        precipitationInchesTYPO: 99.9,
      });

      const parsedRecord = patch as unknown as Record<string, unknown>;
      if (parsedRecord.mode !== undefined) {
        throw new Error(
          'Zod did NOT strip `mode` from smartsEventUpdate body — schema has changed'
        );
      }
      if (parsedRecord.bogusKey !== undefined) {
        throw new Error('Zod did NOT strip `bogusKey`');
      }

      // No legitimate fields → updates dict empty → route would 400.
      const updates: Record<string, unknown> = {};
      if (typeof patch.status === 'string') updates.status = patch.status;
      if (Object.keys(updates).length !== 0) {
        throw new Error(
          'expected empty updates dict for a body of pure garbage'
        );
      }

      // Re-read the row to confirm state is unchanged from step (e).
      const { data, error } = await supabase
        .from('smarts_events')
        .select('status')
        .eq('id', createdEventId)
        .single();
      if (error || !data) {
        throw new Error(error?.message ?? 'no row');
      }
      if (data.status !== 'active') {
        throw new Error(
          `status changed unexpectedly: expected 'active' from step (e), got '${data.status}'`
        );
      }

      pass(
        '(f) PATCH strips unknown keys; status unchanged from step (e)'
      );
    } catch (err) {
      fail('(f) PATCH strips unknown keys', err);
    }
  } else {
    fail(
      '(f) PATCH strips unknown keys',
      new Error('skipped — no id from step (b)')
    );
  }

  // ──── (g) DELETE manual row ───────────────────────────────────────
  if (createdEventId) {
    try {
      const { error } = await supabase
        .from('smarts_events')
        .delete()
        .eq('id', createdEventId);
      if (error) throw new Error(error.message);
      pass('(g) DELETE manual row');
    } catch (err) {
      fail('(g) DELETE manual row', err);
    }
  } else {
    fail('(g) DELETE manual row', new Error('skipped — no id from step (b)'));
  }

  // ──── (h) GET deleted id → 404 (PGRST116) ─────────────────────────
  if (createdEventId) {
    try {
      const { data, error } = await supabase
        .from('smarts_events')
        .select('*')
        .eq('id', createdEventId)
        .single();
      if (error && error.code === 'PGRST116') {
        pass('(h) GET deleted id returns PGRST116 (404 path)');
      } else if (data) {
        throw new Error(
          'expected no row for deleted id, got one — DELETE in step (g) failed?'
        );
      } else {
        throw new Error(
          `expected PGRST116, got code='${error?.code}' message='${error?.message}'`
        );
      }
    } catch (err) {
      fail('(h) GET deleted id', err);
    }
  } else {
    fail('(h) GET deleted id', new Error('skipped — no id from step (b)'));
  }

  // ──── (i) simulate mode='forecast' ────────────────────────────────
  try {
    const body = smartsEventSimulate.parse({
      projectId: PROJECT_ID,
      mode: 'forecast',
    });

    // Same logic as src/app/api/smarts-events/simulate/route.ts POST.
    const now = new Date().toISOString();
    const insertRow = {
      id: generateId(),
      project_id: body.projectId ?? PROJECT_ID,
      status: 'forecast' as const,
      source: 'simulated' as const,
      forecast_detected_at: now,
      started_at: null,
      precipitation_inches: SIMULATED_FORECAST_PRECIP_INCHES,
    };

    const { data, error } = await supabase
      .from('smarts_events')
      .insert(insertRow)
      .select()
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? 'simulate insert returned no row');
    }

    simulatedForecastId = data.id as string;

    if (data.status !== 'forecast') {
      throw new Error(`status not 'forecast', got '${data.status}'`);
    }
    if (data.source !== 'simulated') {
      throw new Error(`source not 'simulated', got '${data.source}'`);
    }
    if (data.started_at !== null) {
      throw new Error(
        `started_at should be null for mode='forecast', got '${data.started_at}'`
      );
    }
    if (Number(data.precipitation_inches) !== SIMULATED_FORECAST_PRECIP_INCHES) {
      throw new Error(
        `precipitation_inches should be ${SIMULATED_FORECAST_PRECIP_INCHES}, got '${data.precipitation_inches}'`
      );
    }
    pass(
      `(i) simulate forecast — status='forecast' source='simulated' precipitation_inches=${SIMULATED_FORECAST_PRECIP_INCHES}`
    );
  } catch (err) {
    fail('(i) simulate forecast', err);
  }

  // ──── (j) simulate mode='starting' ────────────────────────────────
  try {
    const body = smartsEventSimulate.parse({
      projectId: PROJECT_ID,
      mode: 'starting',
    });

    const now = new Date().toISOString();
    const insertRow = {
      id: generateId(),
      project_id: body.projectId ?? PROJECT_ID,
      status: 'active' as const,
      source: 'simulated' as const,
      forecast_detected_at: now,
      started_at: now,
      precipitation_inches: null,
    };

    const { data, error } = await supabase
      .from('smarts_events')
      .insert(insertRow)
      .select()
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? 'simulate insert returned no row');
    }

    simulatedStartingId = data.id as string;

    if (data.status !== 'active') {
      throw new Error(`status not 'active', got '${data.status}'`);
    }
    if (data.source !== 'simulated') {
      throw new Error(`source not 'simulated', got '${data.source}'`);
    }
    if (!data.started_at) {
      throw new Error(`started_at should be set for mode='starting'`);
    }
    if (data.precipitation_inches !== null) {
      throw new Error(
        `precipitation_inches should be null for mode='starting', got '${data.precipitation_inches}'`
      );
    }
    pass(
      `(j) simulate starting — status='active' source='simulated' started_at populated`
    );
  } catch (err) {
    fail('(j) simulate starting', err);
  }

  // ──── (k) simulate Zod rejects mode='banana' ──────────────────────
  try {
    smartsEventSimulate.parse({
      projectId: PROJECT_ID,
      mode: 'banana',
    });
    fail(
      '(k) Zod rejects mode=banana',
      new Error('parse did NOT throw — schema accepted invalid enum')
    );
  } catch (err) {
    if (err instanceof ZodError) {
      pass('(k) Zod rejected mode=banana');
    } else {
      fail('(k) Zod rejects mode=banana', err);
    }
  }

  // ──── (l) list = baseline + 2 (the two simulated rows) ────────────
  try {
    const { data, error } = await supabase
      .from('smarts_events')
      .select('id')
      .eq('project_id', PROJECT_ID);
    if (error) throw new Error(error.message);
    const count = data?.length ?? 0;
    if (count !== baselineCount + 2) {
      throw new Error(
        `expected ${baselineCount + 2} rows (baseline + 2 simulated), got ${count}`
      );
    }
    pass(`(l) list has baseline+2 = ${baselineCount + 2} rows`);
  } catch (err) {
    fail('(l) list after simulate', err);
  }

  // ──── (m) cleanup: delete the two simulated rows ──────────────────
  try {
    const idsToDelete = [simulatedForecastId, simulatedStartingId].filter(
      (x): x is string => x !== null
    );
    if (idsToDelete.length === 0) {
      throw new Error('nothing to clean up — earlier simulate steps failed');
    }
    const { error } = await supabase
      .from('smarts_events')
      .delete()
      .in('id', idsToDelete);
    if (error) throw new Error(error.message);

    // Verify we're back to baseline.
    const { data: postCleanup, error: listErr } = await supabase
      .from('smarts_events')
      .select('id')
      .eq('project_id', PROJECT_ID);
    if (listErr) throw new Error(listErr.message);
    const count = postCleanup?.length ?? 0;
    if (count !== baselineCount) {
      throw new Error(
        `post-cleanup count should equal baseline ${baselineCount}, got ${count}`
      );
    }
    pass(`(m) cleanup: deleted ${idsToDelete.length} simulated rows, back to baseline`);
  } catch (err) {
    fail('(m) cleanup', err);
  }

  console.log('');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error in test script:', err);
  process.exit(1);
});
