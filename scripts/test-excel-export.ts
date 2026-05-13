/**
 * One-off verification for buildSmartsExcelWorkbook + the export API route's
 * lib call. Bypasses HTTP (no auth needed) — exercises the lib directly
 * against admin-client-seeded fixtures.
 *
 * Verifies:
 *   - Output buffer starts with the PK zip header (`50 4B`)
 *   - Both worksheets exist with the expected names
 *   - Sheet 1 has the expected column headers + 1 header + 2 data rows
 *     (one sample × two parameter readings)
 *   - Sheet 2 shows "NAL Exceedance Count" === '1' (Turbidity=310 NTU
 *     exceeds the 250 NTU threshold)
 *   - Normalization fires: units 'su' → 'SU', method 'pH field' →
 *     'pH_field', method 'Hach 2100Q' → 'EPA 180.1', qualifier '=' → ''
 *
 * Writes /tmp/test-export.xlsx for manual inspection.
 *
 * Usage:
 *   npx tsx scripts/test-excel-export.ts
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

import * as fs from 'fs';
import ExcelJS from 'exceljs';
import { createAdminClient } from '../src/lib/supabase/server';
import { buildSmartsExcelWorkbook } from '../src/lib/smarts/excel-export';
import type {
  MonitoringLocation,
  Sample,
  SmartsEvent,
} from '../src/types';

const PROJECT_ID = 'demo-pleasanton';
const OUTPUT_PATH = '/tmp/test-export.xlsx';

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

function genEventId(): string {
  return `smarts-evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function genLocationId(): string {
  return `mloc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function genSampleId(): string {
  return `samp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function genParameterResultId(): string {
  return `pres-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

async function main(): Promise<void> {
  console.log(`Running Excel export verification for project ${PROJECT_ID}\n`);

  const supabase = createAdminClient();

  const TEST_EVENT_ID = genEventId();
  const TEST_LOCATION_ID = genLocationId();
  const TEST_SAMPLE_ID = genSampleId();
  const PR_PH_ID = genParameterResultId();
  const PR_TURB_ID = genParameterResultId();

  let buffer: ArrayBuffer | null = null;

  // ──── (a) Seed fixtures ────────────────────────────────────────────
  try {
    const { error: evtErr } = await supabase.from('smarts_events').insert({
      id: TEST_EVENT_ID,
      project_id: PROJECT_ID,
      status: 'ended',
      source: 'simulated',
      precipitation_inches: 0.85,
      started_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      ended_at: new Date().toISOString(),
    });
    if (evtErr) throw new Error(`smarts_events insert: ${evtErr.message}`);

    const { error: locErr } = await supabase.from('monitoring_locations').insert({
      id: TEST_LOCATION_ID,
      project_id: PROJECT_ID,
      name: 'DP-EXPORT-TEST',
      drainage_area: 'DA-EXPORT (1.0 ac)',
      discharge_point_type: 'Effluent',
    });
    if (locErr) throw new Error(`monitoring_locations insert: ${locErr.message}`);

    const { error: smpErr } = await supabase.from('samples').insert({
      id: TEST_SAMPLE_ID,
      project_id: PROJECT_ID,
      smarts_event_id: TEST_EVENT_ID,
      monitoring_location_id: TEST_LOCATION_ID,
      sample_datetime: '2026-05-13T15:30:00.000Z',
      qsp_name: 'Excel Export Test',
    });
    if (smpErr) throw new Error(`samples insert: ${smpErr.message}`);

    const { error: prErr } = await supabase.from('parameter_results').insert([
      {
        id: PR_PH_ID,
        project_id: PROJECT_ID,
        sample_id: TEST_SAMPLE_ID,
        parameter: 'pH',
        qualifier: '=',
        result: 8.5, // within NAL — no exceedance from pH
        units: 'su',
        analytical_method: 'pH field',
        mdl: 1,
        analyzed_by: 'Self',
      },
      {
        id: PR_TURB_ID,
        project_id: PROJECT_ID,
        sample_id: TEST_SAMPLE_ID,
        parameter: 'Turbidity',
        qualifier: '=',
        result: 310, // > 250 NTU — single NAL exceedance
        units: 'NTU',
        analytical_method: 'Hach 2100Q',
        mdl: 1,
        analyzed_by: 'Lab',
      },
    ]);
    if (prErr) throw new Error(`parameter_results insert: ${prErr.message}`);

    pass(`(a) seeded fixtures: event ${TEST_EVENT_ID}, location ${TEST_LOCATION_ID}, 1 sample with 2 readings`);
  } catch (err) {
    fail('(a) seed fixtures', err);
  }

  // ──── (b) Build the workbook via the lib ───────────────────────────
  try {
    const event: SmartsEvent = {
      id: TEST_EVENT_ID,
      projectId: PROJECT_ID,
      status: 'ended',
      source: 'simulated',
      forecastDetectedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
      startedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      endedAt: new Date().toISOString(),
      precipitationInches: 0.85,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const locations: MonitoringLocation[] = [
      {
        id: TEST_LOCATION_ID,
        projectId: PROJECT_ID,
        name: 'DP-EXPORT-TEST',
        drainageArea: 'DA-EXPORT (1.0 ac)',
        dischargePointType: 'Effluent',
        isAts: false,
        isPassiveTreatment: false,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const samples: Sample[] = [
      {
        id: TEST_SAMPLE_ID,
        projectId: PROJECT_ID,
        smartsEventId: TEST_EVENT_ID,
        monitoringLocationId: TEST_LOCATION_ID,
        sampleDatetime: '2026-05-13T15:30:00.000Z',
        qspName: 'Excel Export Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parameterResults: [
          {
            id: PR_PH_ID,
            projectId: PROJECT_ID,
            sampleId: TEST_SAMPLE_ID,
            parameter: 'pH',
            qualifier: '=',
            result: 8.5,
            units: 'su',
            analyticalMethod: 'pH field',
            mdl: 1,
            analyzedBy: 'Self',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: PR_TURB_ID,
            projectId: PROJECT_ID,
            sampleId: TEST_SAMPLE_ID,
            parameter: 'Turbidity',
            qualifier: '=',
            result: 310,
            units: 'NTU',
            analyticalMethod: 'Hach 2100Q',
            mdl: 1,
            analyzedBy: 'Lab',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    ];

    buffer = await buildSmartsExcelWorkbook({
      event,
      projectName: 'Demo Pleasanton',
      wdid: '8 56C123456',
      monitoringLocations: locations,
      samples,
    });
    pass(`(b) buildSmartsExcelWorkbook returned ${buffer.byteLength} bytes`);
  } catch (err) {
    fail('(b) build workbook', err);
  }

  // ──── (c) PK zip header check ──────────────────────────────────────
  if (buffer) {
    try {
      const u8 = new Uint8Array(buffer);
      if (u8[0] === 0x50 && u8[1] === 0x4b) {
        pass(`(c) buffer starts with PK zip header (50 4B)`);
      } else {
        throw new Error(
          `expected 0x50 0x4B prefix, got 0x${u8[0]?.toString(16)} 0x${u8[1]?.toString(16)}`
        );
      }
    } catch (err) {
      fail('(c) PK zip header', err);
    }
  } else {
    fail('(c) PK zip header', new Error('skipped — no buffer from step (b)'));
  }

  // ──── (d) Write to /tmp for manual inspection ─────────────────────
  if (buffer) {
    try {
      fs.writeFileSync(OUTPUT_PATH, Buffer.from(buffer));
      pass(`(d) wrote ${OUTPUT_PATH} — open it to inspect`);
    } catch (err) {
      fail('(d) write to /tmp', err);
    }
  } else {
    fail('(d) write to /tmp', new Error('skipped — no buffer from step (b)'));
  }

  // ──── (e) Read back with exceljs ───────────────────────────────────
  let readback: ExcelJS.Workbook | null = null;
  if (buffer) {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      readback = wb;
      pass(`(e) workbook re-opens via exceljs`);
    } catch (err) {
      fail('(e) re-open via exceljs', err);
    }
  } else {
    fail('(e) re-open via exceljs', new Error('skipped — no buffer'));
  }

  // ──── (f) Sheet names ──────────────────────────────────────────────
  if (readback) {
    try {
      const names = readback.worksheets.map((w) => w.name);
      const expected = ['Ad Hoc Monitoring Report', 'Project Summary'];
      if (names[0] !== expected[0] || names[1] !== expected[1]) {
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(names)}`);
      }
      pass(`(f) sheet names match: ${JSON.stringify(names)}`);
    } catch (err) {
      fail('(f) sheet names', err);
    }
  } else {
    fail('(f) sheet names', new Error('skipped'));
  }

  // ──── (g) Sheet 1: column headers + row count ─────────────────────
  if (readback) {
    try {
      const sheet1 = readback.getWorksheet('Ad Hoc Monitoring Report');
      if (!sheet1) throw new Error('Sheet 1 missing');

      const headerCells = sheet1.getRow(1).values as unknown[];
      // exceljs returns 1-indexed array; index 0 is undefined
      const headers = (headerCells.slice(1) as string[]).filter(Boolean);
      const expectedHeaders = [
        'Location',
        'Sample Date',
        'Sample Time',
        'Parameter',
        'Result',
        'Units',
        'Qualifier',
        'Analytical Method',
        'MDL',
        'RL',
        'Analyzed By',
      ];
      if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
        throw new Error(
          `header mismatch:\n  expected ${JSON.stringify(expectedHeaders)}\n  got      ${JSON.stringify(headers)}`
        );
      }

      // Row count: header + 2 data rows = 3
      if (sheet1.rowCount !== 3) {
        throw new Error(`expected rowCount=3, got ${sheet1.rowCount}`);
      }
      pass(`(g) Sheet 1 columns + row count correct (1 header + 2 data rows)`);
    } catch (err) {
      fail('(g) Sheet 1 columns + row count', err);
    }
  } else {
    fail('(g) Sheet 1 columns + row count', new Error('skipped'));
  }

  // ──── (h) Sheet 1 normalization ────────────────────────────────────
  if (readback) {
    try {
      const sheet1 = readback.getWorksheet('Ad Hoc Monitoring Report');
      if (!sheet1) throw new Error('Sheet 1 missing');

      // Row 2: first data row — pH (alphabetical comes before Turbidity)
      const row2 = sheet1.getRow(2);
      const row3 = sheet1.getRow(3);

      // exceljs columns are 1-indexed: Location=1, SampleDate=2, SampleTime=3,
      // Parameter=4, Result=5, Units=6, Qualifier=7, Method=8, MDL=9, RL=10,
      // AnalyzedBy=11
      const phRow = [row2, row3].find((r) => String(r.getCell(4).value) === 'pH');
      const turbRow = [row2, row3].find((r) => String(r.getCell(4).value) === 'Turbidity');
      if (!phRow || !turbRow) {
        throw new Error('could not find pH/Turbidity rows by Parameter column');
      }

      const phUnits = String(phRow.getCell(6).value);
      if (phUnits !== 'SU') throw new Error(`pH Units normalize: expected 'SU', got '${phUnits}'`);

      const phMethod = String(phRow.getCell(8).value);
      if (phMethod !== 'pH_field') {
        throw new Error(`pH Method normalize: expected 'pH_field', got '${phMethod}'`);
      }

      const turbMethod = String(turbRow.getCell(8).value);
      if (turbMethod !== 'EPA 180.1') {
        throw new Error(`Turbidity Method normalize: expected 'EPA 180.1', got '${turbMethod}'`);
      }

      const phQualifier = phRow.getCell(7).value;
      // qualifier '=' should normalize to blank — undefined or empty string is fine
      if (phQualifier !== null && phQualifier !== undefined && phQualifier !== '') {
        throw new Error(
          `pH Qualifier normalize: expected blank, got '${String(phQualifier)}'`
        );
      }

      // Sample Date / Time format
      const dateCell = String(phRow.getCell(2).value);
      const timeCell = String(phRow.getCell(3).value);
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateCell)) {
        throw new Error(`Sample Date format: expected MM/DD/YYYY, got '${dateCell}'`);
      }
      if (!/^\d{2}:\d{2}$/.test(timeCell)) {
        throw new Error(`Sample Time format: expected HH:MM, got '${timeCell}'`);
      }

      pass(`(h) Sheet 1 normalization fires: SU, pH_field, EPA 180.1, blank qualifier, MM/DD/YYYY + HH:MM`);
    } catch (err) {
      fail('(h) Sheet 1 normalization', err);
    }
  } else {
    fail('(h) Sheet 1 normalization', new Error('skipped'));
  }

  // ──── (i) Sheet 2: NAL Exceedance Count = 1 ────────────────────────
  if (readback) {
    try {
      const sheet2 = readback.getWorksheet('Project Summary');
      if (!sheet2) throw new Error('Sheet 2 missing');

      let foundNalRow: ExcelJS.Row | null = null;
      sheet2.eachRow((row) => {
        if (String(row.getCell(1).value) === 'NAL Exceedance Count') {
          foundNalRow = row;
        }
      });
      if (!foundNalRow) {
        throw new Error('no "NAL Exceedance Count" row in Project Summary');
      }

      const value = String((foundNalRow as ExcelJS.Row).getCell(2).value);
      if (value !== '1') {
        throw new Error(`expected NAL count = '1', got '${value}'`);
      }
      pass(`(i) Sheet 2 "NAL Exceedance Count" === '1'`);
    } catch (err) {
      fail('(i) Sheet 2 NAL count', err);
    }
  } else {
    fail('(i) Sheet 2 NAL count', new Error('skipped'));
  }

  // ──── (j) Cleanup ──────────────────────────────────────────────────
  try {
    // Deleting the smarts_event cascades to samples → parameter_results.
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
