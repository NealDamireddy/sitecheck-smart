/**
 * One-off verification for the samples API logic + Zod schemas +
 * delete-then-insert parameter_results behavior + CASCADE.
 *
 * Bypasses HTTP via the admin Supabase client (same pattern as
 * scripts/apply-migrations.ts and scripts/test-monitoring-locations.ts).
 * Exercises the same Zod schemas + DB write sequence the API routes
 * use, including the inspections-style "lookup → insert OR update → drop
 * children → re-insert children" flow.
 *
 * Precondition: project 'demo-pleasanton' exists. The script creates
 * its own smarts_event + monitoring_location as fixtures (unique ids)
 * and cleans them up in step (j).
 *
 * Usage:
 *   npx tsx scripts/test-samples.ts
 *
 * Exits 0 if all 10 checks pass, 1 on any failure. Leaves no rows behind.
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
import { sampleCreate, sampleUpdate } from '../src/lib/validations';

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

function generateSampleId(): string {
  return `samp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateParameterResultId(): string {
  return `pres-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateSmartsEventId(): string {
  return `smarts-evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateMonitoringLocationId(): string {
  return `mloc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

async function main(): Promise<void> {
  console.log(`Running samples verification for project ${PROJECT_ID}\n`);

  const supabase = createAdminClient();

  const TEST_EVENT_ID = generateSmartsEventId();
  const TEST_LOCATION_ID = generateMonitoringLocationId();
  let createdSampleId: string | null = null;

  // ──── (a) list for fresh event id — expect empty ──────────────────
  try {
    const { data, error } = await supabase
      .from('samples')
      .select('id')
      .eq('smarts_event_id', TEST_EVENT_ID);
    if (error) throw new Error(error.message);
    const count = data?.length ?? 0;
    if (count === 0) {
      pass(`(a) initial list for ${TEST_EVENT_ID} is empty`);
    } else {
      throw new Error(`expected 0 rows, got ${count}`);
    }
  } catch (err) {
    fail('(a) initial list', err);
  }

  // ──── (b) setup: create smarts_event + monitoring_location ────────
  // The samples table has FKs to BOTH parents. Neal's spec mentioned
  // only the smarts_event, but the monitoring_location is equally
  // required — calling both out explicitly here.
  try {
    const { error: evtErr } = await supabase.from('smarts_events').insert({
      id: TEST_EVENT_ID,
      project_id: PROJECT_ID,
      status: 'active',
      source: 'simulated',
    });
    if (evtErr) throw new Error(`smarts_events insert: ${evtErr.message}`);

    const { error: locErr } = await supabase
      .from('monitoring_locations')
      .insert({
        id: TEST_LOCATION_ID,
        project_id: PROJECT_ID,
        name: 'DP-TEST',
        drainage_area: 'DA-TEST',
        discharge_point_type: 'Effluent',
      });
    if (locErr)
      throw new Error(`monitoring_locations insert: ${locErr.message}`);

    pass(`(b) setup: smarts_event ${TEST_EVENT_ID} + monitoring_location ${TEST_LOCATION_ID}`);
  } catch (err) {
    fail('(b) setup parents', err);
  }

  // ──── (c) POST sample with 2 parameter_results ────────────────────
  try {
    const body = sampleCreate.parse({
      projectId: PROJECT_ID,
      smartsEventId: TEST_EVENT_ID,
      monitoringLocationId: TEST_LOCATION_ID,
      qspName: 'Test QSP',
      parameterResults: [
        {
          parameter: 'pH',
          qualifier: '=',
          result: 7.2,
          units: 'pH units',
          analyticalMethod: 'pH field',
          mdl: 1,
          analyzedBy: 'Self',
        },
        {
          parameter: 'Turbidity',
          qualifier: '=',
          result: 45,
          units: 'NTU',
          analyticalMethod: 'Hach 2100Q',
          mdl: 1,
          analyzedBy: 'Self',
        },
      ],
    });

    // Same flow as the POST route: lookup, insert (no existing), then
    // delete-then-insert parameter_results.
    createdSampleId = body.id || generateSampleId();
    const { error: insErr } = await supabase.from('samples').insert({
      id: createdSampleId,
      project_id: body.projectId,
      smarts_event_id: body.smartsEventId,
      monitoring_location_id: body.monitoringLocationId,
      sample_datetime: body.sampleDatetime || new Date().toISOString(),
      qsp_name: body.qspName,
    });
    if (insErr) throw new Error(`sample insert: ${insErr.message}`);

    const dbResults = (body.parameterResults ?? []).map((pr) => ({
      id: generateParameterResultId(),
      project_id: body.projectId!,
      sample_id: createdSampleId!,
      parameter: pr.parameter,
      qualifier: pr.qualifier ?? '=',
      result: pr.result ?? null,
      units: pr.units,
      analytical_method: pr.analyticalMethod,
      mdl: pr.mdl ?? null,
      rl: pr.rl ?? null,
      analyzed_by: pr.analyzedBy ?? 'Self',
    }));
    const { error: prErr } = await supabase
      .from('parameter_results')
      .insert(dbResults);
    if (prErr) throw new Error(`parameter_results insert: ${prErr.message}`);

    pass(`(c) POST created sample ${createdSampleId} with 2 parameter_results`);
  } catch (err) {
    fail('(c) POST sample + parameter_results', err);
  }

  // ──── (d) list — expect 1 sample with 2 parameter_results ─────────
  try {
    const { data, error } = await supabase
      .from('samples')
      .select(
        `
        *,
        parameter_results (*)
      `
      )
      .eq('smarts_event_id', TEST_EVENT_ID);
    if (error) throw new Error(error.message);
    if ((data?.length ?? 0) !== 1) {
      throw new Error(`expected 1 sample, got ${data?.length}`);
    }
    const prCount = (data![0].parameter_results as unknown[])?.length ?? 0;
    if (prCount !== 2) {
      throw new Error(`expected 2 parameter_results, got ${prCount}`);
    }
    pass('(d) list shows 1 sample with 2 parameter_results joined');
  } catch (err) {
    fail('(d) list with joined parameter_results', err);
  }

  // ──── (e) POST again — upsert path, keep id stable ────────────────
  if (createdSampleId) {
    try {
      const body = sampleCreate.parse({
        projectId: PROJECT_ID,
        smartsEventId: TEST_EVENT_ID,
        monitoringLocationId: TEST_LOCATION_ID,
        qspName: 'Test QSP (resampled)',
        parameterResults: [
          {
            parameter: 'pH',
            qualifier: '=',
            result: 8.9, // changed
            units: 'pH units',
            analyticalMethod: 'pH field',
            mdl: 1,
            analyzedBy: 'Self',
          },
          {
            parameter: 'Turbidity',
            qualifier: '=',
            result: 310, // changed — NAL exceedance
            units: 'NTU',
            analyticalMethod: 'Hach 2100Q',
            mdl: 1,
            analyzedBy: 'Self',
          },
        ],
      });

      // Lookup existing
      const { data: existing, error: lookupError } = await supabase
        .from('samples')
        .select('id')
        .eq('smarts_event_id', body.smartsEventId)
        .eq('monitoring_location_id', body.monitoringLocationId)
        .maybeSingle();
      if (lookupError && lookupError.code !== 'PGRST116') {
        throw new Error(`lookup: ${lookupError.message}`);
      }
      if (!existing) {
        throw new Error('expected existing sample for upsert path, found none');
      }
      if ((existing.id as string) !== createdSampleId) {
        throw new Error(
          `id changed: expected ${createdSampleId}, got ${existing.id}`
        );
      }

      // Update + delete + re-insert
      const { error: updErr } = await supabase
        .from('samples')
        .update({
          sample_datetime: body.sampleDatetime || new Date().toISOString(),
          qsp_name: body.qspName,
        })
        .eq('id', createdSampleId);
      if (updErr) throw new Error(`sample update: ${updErr.message}`);

      const { error: delErr } = await supabase
        .from('parameter_results')
        .delete()
        .eq('sample_id', createdSampleId);
      if (delErr) throw new Error(`parameter_results delete: ${delErr.message}`);

      const dbResults = (body.parameterResults ?? []).map((pr) => ({
        id: generateParameterResultId(),
        project_id: body.projectId!,
        sample_id: createdSampleId!,
        parameter: pr.parameter,
        qualifier: pr.qualifier ?? '=',
        result: pr.result ?? null,
        units: pr.units,
        analytical_method: pr.analyticalMethod,
        mdl: pr.mdl ?? null,
        rl: pr.rl ?? null,
        analyzed_by: pr.analyzedBy ?? 'Self',
      }));
      const { error: prErr } = await supabase
        .from('parameter_results')
        .insert(dbResults);
      if (prErr) throw new Error(`parameter_results re-insert: ${prErr.message}`);

      // Verify the sample list is still length 1 with the updated qsp_name
      const { data: list, error: listErr } = await supabase
        .from('samples')
        .select('id, qsp_name')
        .eq('smarts_event_id', TEST_EVENT_ID);
      if (listErr) throw new Error(listErr.message);
      if ((list?.length ?? 0) !== 1) {
        throw new Error(`expected 1 sample after upsert, got ${list?.length}`);
      }
      if (list![0].qsp_name !== 'Test QSP (resampled)') {
        throw new Error(
          `qsp_name not updated: got '${list![0].qsp_name}'`
        );
      }
      pass(
        '(e) POST upsert path: id stable, sample updated, list still has 1 row'
      );
    } catch (err) {
      fail('(e) POST upsert', err);
    }
  } else {
    fail('(e) POST upsert', new Error('skipped — no sample id from step (c)'));
  }

  // ──── (f) verify parameter_results count = 2 (not 4) ──────────────
  if (createdSampleId) {
    try {
      const { data, error } = await supabase
        .from('parameter_results')
        .select('id, parameter, result')
        .eq('sample_id', createdSampleId);
      if (error) throw new Error(error.message);
      const count = data?.length ?? 0;
      if (count !== 2) {
        throw new Error(
          `expected 2 parameter_results after upsert, got ${count} (delete-then-insert failed?)`
        );
      }
      // Bonus: confirm the values reflect the second POST
      const ph = data!.find((r) => r.parameter === 'pH');
      const turb = data!.find((r) => r.parameter === 'Turbidity');
      if (!ph || ph.result !== 8.9) {
        throw new Error(`pH should be 8.9 after upsert, got ${ph?.result}`);
      }
      if (!turb || turb.result !== 310) {
        throw new Error(
          `Turbidity should be 310 after upsert, got ${turb?.result}`
        );
      }
      pass('(f) parameter_results count is 2 (old rows deleted), values updated');
    } catch (err) {
      fail('(f) parameter_results count after upsert', err);
    }
  } else {
    fail(
      '(f) parameter_results count after upsert',
      new Error('skipped — no sample id from step (c)')
    );
  }

  // ──── (g) PATCH sample_datetime ───────────────────────────────────
  if (createdSampleId) {
    try {
      const newTs = '2026-05-12T15:30:00.000Z';
      const patch = sampleUpdate.parse({
        sampleDatetime: newTs,
      });
      const updates: Record<string, unknown> = {};
      if (typeof patch.sampleDatetime === 'string') {
        updates.sample_datetime = patch.sampleDatetime;
      }

      const { data, error } = await supabase
        .from('samples')
        .update(updates)
        .eq('id', createdSampleId)
        .select()
        .single();
      if (error || !data) {
        throw new Error(error?.message ?? 'update returned no row');
      }
      const dbTs = new Date(data.sample_datetime as string).toISOString();
      if (dbTs !== newTs) {
        throw new Error(
          `sample_datetime not persisted, expected ${newTs}, got ${dbTs}`
        );
      }
      pass('(g) PATCH updated sample_datetime');
    } catch (err) {
      fail('(g) PATCH sample_datetime', err);
    }
  } else {
    fail('(g) PATCH sample_datetime', new Error('skipped — no sample id from step (c)'));
  }

  // ──── (g2) PATCH silently strips parameterResults (footgun guard) ─
  // Documents that sampleUpdate's Zod schema strips parameterResults at
  // parse time, so a PATCH body that includes them cannot overwrite the
  // readings (which are owned by POST /api/samples upserts). If anyone
  // later adds parameterResults to sampleUpdate without thinking, this
  // step fails loudly on two levels: the explicit parsed-object check
  // AND the DB-state check.
  if (createdSampleId) {
    try {
      const patch = sampleUpdate.parse({
        qspName: 'Updated Name',
        // Bogus parameterResults — Zod default strip should drop these.
        parameterResults: [
          {
            parameter: 'pH',
            units: 'su',
            analyticalMethod: 'test',
            result: 99.9,
          },
        ],
      });

      // 1. Confirm Zod actually stripped parameterResults from the parsed
      //    object. If someone adds parameterResults to sampleUpdate, this
      //    fires immediately — independent of whether the route handler
      //    decides to apply it.
      const parsedRecord = patch as unknown as Record<string, unknown>;
      if (parsedRecord.parameterResults !== undefined) {
        throw new Error(
          'Zod did NOT strip parameterResults — sampleUpdate schema has changed; ' +
            'PATCH would now overwrite readings, defeating the upsert-only contract'
        );
      }

      // 2. Apply the patch via the same skip-empty pattern the route uses.
      const updates: Record<string, unknown> = {};
      if (typeof patch.qspName === 'string') updates.qsp_name = patch.qspName;
      if (typeof patch.sampleDatetime === 'string') {
        updates.sample_datetime = patch.sampleDatetime;
      }

      const { error: updErr } = await supabase
        .from('samples')
        .update(updates)
        .eq('id', createdSampleId);
      if (updErr) throw new Error(`patch update: ${updErr.message}`);

      // 3. Re-fetch with parameter_results joined.
      const { data, error: fetchErr } = await supabase
        .from('samples')
        .select(
          `
          *,
          parameter_results (*)
        `
        )
        .eq('id', createdSampleId)
        .single();
      if (fetchErr || !data) {
        throw new Error(`fetch after patch: ${fetchErr?.message ?? 'no row'}`);
      }

      // 4. qspName updated successfully.
      if (data.qsp_name !== 'Updated Name') {
        throw new Error(
          `qsp_name not updated: expected 'Updated Name', got '${data.qsp_name}'`
        );
      }

      // 5. parameter_results unchanged from step (e) — pH=8.9, Turbidity=310.
      const prs = (data.parameter_results ?? []) as Array<{
        parameter: string;
        result: number | null;
      }>;
      if (prs.length !== 2) {
        throw new Error(
          `parameter_results count changed: expected 2, got ${prs.length}`
        );
      }
      const ph = prs.find((r) => r.parameter === 'pH');
      const turb = prs.find((r) => r.parameter === 'Turbidity');
      if (!ph || ph.result !== 8.9) {
        throw new Error(
          `pH result should still be 8.9 from step (e), got ${ph?.result}`
        );
      }
      if (!turb || turb.result !== 310) {
        throw new Error(
          `Turbidity result should still be 310 from step (e), got ${turb?.result}`
        );
      }
      if (prs.some((r) => r.result === 99.9)) {
        throw new Error(
          'parameter_results contains result=99.9 — PATCH body parameterResults was NOT stripped'
        );
      }

      pass(
        '(g2) PATCH strips parameterResults: qspName updated, readings unchanged'
      );
    } catch (err) {
      fail('(g2) PATCH strips parameterResults', err);
    }
  } else {
    fail(
      '(g2) PATCH strips parameterResults',
      new Error('skipped — no sample id from step (c)')
    );
  }

  // ──── (h) DELETE sample — list returns [] (cascades) ──────────────
  if (createdSampleId) {
    try {
      const { error: delErr } = await supabase
        .from('samples')
        .delete()
        .eq('id', createdSampleId);
      if (delErr) throw new Error(delErr.message);

      const { data: list, error: listErr } = await supabase
        .from('samples')
        .select('id')
        .eq('smarts_event_id', TEST_EVENT_ID);
      if (listErr) throw new Error(listErr.message);
      if ((list?.length ?? 0) !== 0) {
        throw new Error(`expected 0 samples after delete, got ${list?.length}`);
      }

      // Also verify cascade — parameter_results for this sample should be gone
      const { data: prs, error: prListErr } = await supabase
        .from('parameter_results')
        .select('id')
        .eq('sample_id', createdSampleId);
      if (prListErr) throw new Error(prListErr.message);
      if ((prs?.length ?? 0) !== 0) {
        throw new Error(
          `parameter_results CASCADE failed — expected 0, got ${prs?.length}`
        );
      }

      pass('(h) DELETE sample → list empty, parameter_results cascaded');
      createdSampleId = null;
    } catch (err) {
      fail('(h) DELETE sample + cascade', err);
    }
  } else {
    fail('(h) DELETE sample + cascade', new Error('skipped — no sample id from step (c)'));
  }

  // ──── (i) Zod rejects invalid pH value ────────────────────────────
  try {
    sampleCreate.parse({
      projectId: PROJECT_ID,
      smartsEventId: TEST_EVENT_ID,
      monitoringLocationId: TEST_LOCATION_ID,
      qspName: 'Test QSP',
      parameterResults: [
        {
          parameter: 'pH',
          qualifier: '=',
          result: -1, // out of range
          units: 'pH units',
          analyticalMethod: 'pH field',
        },
      ],
    });
    fail(
      '(i) Zod rejects result=-1',
      new Error('parse did NOT throw — schema accepted invalid value')
    );
  } catch (err) {
    if (err instanceof ZodError) {
      pass('(i) Zod rejected parameterResults[0].result=-1');
    } else {
      fail('(i) Zod rejects result=-1', err);
    }
  }

  // ──── (j) cleanup: delete fixtures ────────────────────────────────
  try {
    const { error: evtErr } = await supabase
      .from('smarts_events')
      .delete()
      .eq('id', TEST_EVENT_ID);
    if (evtErr) throw new Error(`smarts_events cleanup: ${evtErr.message}`);

    const { error: locErr } = await supabase
      .from('monitoring_locations')
      .delete()
      .eq('id', TEST_LOCATION_ID);
    if (locErr) throw new Error(`monitoring_locations cleanup: ${locErr.message}`);

    pass('(j) cleanup: deleted smarts_event + monitoring_location fixtures');
  } catch (err) {
    fail('(j) cleanup', err);
  }

  console.log('');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error in test script:', err);
  process.exit(1);
});
