/**
 * Pure-function verification for buildSmartsWalkthrough.
 *
 * No DB, no admin client — builds an in-memory SmartsExportInput with a
 * single NAL-exceeding sample and asserts the returned string contains
 * (or excludes) the right substrings.
 *
 * Usage:
 *   npx tsx scripts/test-walkthrough.ts
 */

import { buildSmartsWalkthrough } from '../src/lib/smarts/walkthrough';
import type { SmartsExportInput } from '../src/lib/smarts/types';

const PROJECT_NAME = 'Demo Pleasanton';
const WDID = '8 56C123456';

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

function buildInput(): SmartsExportInput {
  const now = new Date('2026-05-13T15:30:00.000Z').toISOString();
  return {
    event: {
      id: 'smarts-evt-test-walkthrough',
      projectId: 'demo-pleasanton',
      status: 'ended',
      source: 'simulated',
      forecastDetectedAt: '2026-05-12T18:00:00.000Z',
      startedAt: '2026-05-13T09:00:00.000Z',
      endedAt: now,
      precipitationInches: 0.85,
      notes: 'NOAA QPE confirmed; first storm of the season.',
    },
    projectName: PROJECT_NAME,
    wdid: WDID,
    monitoringLocations: [
      {
        id: 'mloc-walkthrough-dp1',
        projectId: 'demo-pleasanton',
        name: 'DP-WALK-1',
        drainageArea: 'DA-1 (4.0 ac)',
        dischargePointType: 'Effluent',
        isAts: false,
        isPassiveTreatment: false,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mloc-walkthrough-dp2',
        projectId: 'demo-pleasanton',
        name: 'DP-WALK-2',
        drainageArea: 'DA-2 (3.0 ac)',
        dischargePointType: 'Receiving Water',
        isAts: false,
        isPassiveTreatment: true,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ],
    samples: [
      {
        id: 'samp-walkthrough-1',
        projectId: 'demo-pleasanton',
        smartsEventId: 'smarts-evt-test-walkthrough',
        monitoringLocationId: 'mloc-walkthrough-dp1',
        sampleDatetime: '2026-05-13T15:30:00.000Z',
        qspName: 'Walkthrough Test QSP',
        createdAt: now,
        updatedAt: now,
        parameterResults: [
          {
            id: 'pres-walkthrough-ph',
            projectId: 'demo-pleasanton',
            sampleId: 'samp-walkthrough-1',
            parameter: 'pH',
            qualifier: '=',
            result: 8.5,
            units: 'su',
            analyticalMethod: 'pH field',
            mdl: 1,
            analyzedBy: 'Self',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'pres-walkthrough-turb',
            projectId: 'demo-pleasanton',
            sampleId: 'samp-walkthrough-1',
            parameter: 'Turbidity',
            qualifier: '=',
            result: 310,
            units: 'NTU',
            analyticalMethod: 'Hach 2100Q',
            mdl: 1,
            analyzedBy: 'Lab',
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    ],
  };
}

function main(): void {
  console.log('Running walkthrough verification\n');

  const input = buildInput();
  let text = '';
  try {
    text = buildSmartsWalkthrough(input);
    pass(`(a) buildSmartsWalkthrough returned ${text.length} chars`);
  } catch (err) {
    fail('(a) buildSmartsWalkthrough call', err);
  }

  if (!text) {
    console.error('\nNo output; aborting further checks.');
    process.exit(1);
  }

  // (b) required substrings
  const required: Array<[string, string]> = [
    ['project name', PROJECT_NAME],
    ['WDID', WDID],
    ['location DP-WALK-1', 'DP-WALK-1'],
    ['location DP-WALK-2', 'DP-WALK-2'],
    ['parameter pH', 'pH'],
    ['pH result value 8.5', '8.5'],
    ['units SU (uppercase)', 'SU'],
    ['parameter Turbidity', 'Turbidity'],
    ['turbidity result value 310', '310'],
    ['units NTU', 'NTU'],
    ['NAL Exceedance flag', 'NAL Exceedance'],
    ['normalized method EPA 180.1', 'EPA 180.1'],
    ['normalized method pH_field', 'pH_field'],
    ['STEP 1 header', 'STEP 1'],
    ['STEP 2 header', 'STEP 2'],
    ['STEP 3 header', 'STEP 3'],
    ['STEP 4 header', 'STEP 4'],
    ['STEP 5 header', 'STEP 5'],
    ['STEP 6 header', 'STEP 6'],
    ['STEP 7 header', 'STEP 7'],
  ];
  for (const [desc, needle] of required) {
    if (text.includes(needle)) {
      pass(`(b) contains ${desc}: "${needle}"`);
    } else {
      fail(`(b) contains ${desc}`, new Error(`missing substring: "${needle}"`));
    }
  }

  // (c) forbidden substrings
  const forbiddenLiteral: Array<[string, string]> = [
    ['"null"', 'null'],
    ['"undefined"', 'undefined'],
    ['"[object Object]"', '[object Object]'],
    ['legacy method "Hach 2100Q"', 'Hach 2100Q'],
  ];
  for (const [desc, needle] of forbiddenLiteral) {
    if (text.includes(needle)) {
      fail(`(c) excludes ${desc}`, new Error(`found forbidden substring: "${needle}"`));
    } else {
      pass(`(c) excludes ${desc}`);
    }
  }

  // (c2) lowercase "su" as a standalone token (word boundaries)
  const lowercaseSuRegex = /\bsu\b/;
  if (lowercaseSuRegex.test(text)) {
    fail('(c) excludes lowercase "su" alone', new Error('found word-boundary "su"'));
  } else {
    pass('(c) excludes lowercase "su" alone (word-boundary)');
  }

  // (d) length bound 800–5000 chars
  if (text.length >= 800 && text.length <= 5000) {
    pass(`(d) length ${text.length} within [800, 5000]`);
  } else {
    fail(
      '(d) length within [800, 5000]',
      new Error(`got ${text.length} chars — outside bounds`)
    );
  }

  // (e) 200-char preview
  console.log('');
  console.log('--- 200-char preview ---');
  console.log(text.slice(0, 200));
  console.log('--- end preview ---');

  console.log('');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
