/**
 * Stage 3 — regulatory boundary tests: NAL exact values, ND/DNQ
 * combinations, and the constants module's internal consistency.
 */
import { describe, expect, it } from 'vitest';
import { isParameterNal, isNalExceedance } from '@/lib/smarts/nal-thresholds';
import {
  NAL_PH_MIN_SU,
  NAL_PH_MAX_SU,
  NAL_TURBIDITY_NTU,
  QPE_THRESHOLD_INCHES,
  QPE_SEPARATION_HOURS,
  REPAIR_START_HOURS,
  postStormWindowHours,
} from '@/lib/cgp/constants';
import { ndDnqViolation } from '@/lib/validations/nd-dnq';
import { parameterResultCreate } from '@/lib/validations/parameter-result';

describe('NAL pH boundaries (NAL is <6.0 or >9.0 — exact values compliant)', () => {
  const cases: Array<[number, boolean]> = [
    [5.9, true],
    [6.0, false],
    [6.1, false],
    [8.9, false],
    [9.0, false],
    [9.1, true],
  ];
  for (const [value, exceeds] of cases) {
    it(`pH ${value.toFixed(1)} → ${exceeds ? 'EXCEEDANCE' : 'compliant'}`, () => {
      expect(isParameterNal({ parameter: 'pH', result: value })).toBe(exceeds);
    });
  }
});

describe('NAL turbidity boundaries (NAL is >250 NTU — 250 exactly compliant)', () => {
  const cases: Array<[number, boolean]> = [
    [249, false],
    [250, false],
    [251, true],
  ];
  for (const [value, exceeds] of cases) {
    it(`${value} NTU → ${exceeds ? 'EXCEEDANCE' : 'compliant'}`, () => {
      expect(isParameterNal({ parameter: 'Turbidity', result: value })).toBe(exceeds);
    });
  }
});

describe('NAL sample-level evaluation', () => {
  it('null results (ND/DNQ) never flag an exceedance', () => {
    expect(isParameterNal({ parameter: 'pH', result: undefined })).toBe(false);
    expect(isNalExceedance([{ parameter: 'Turbidity', result: undefined }])).toBe(false);
  });
  it('any exceeding parameter flags the sample', () => {
    expect(
      isNalExceedance([
        { parameter: 'pH', result: 7.0 },
        { parameter: 'Turbidity', result: 300 },
      ])
    ).toBe(true);
  });
});

describe('constants module consistency', () => {
  it('matches the permit values', () => {
    expect(NAL_PH_MIN_SU).toBe(6.0);
    expect(NAL_PH_MAX_SU).toBe(9.0);
    expect(NAL_TURBIDITY_NTU).toBe(250);
    expect(QPE_THRESHOLD_INCHES).toBe(0.5);
    expect(QPE_SEPARATION_HOURS).toBe(48);
    expect(REPAIR_START_HOURS).toBe(72);
  });
  it('post-storm window: 48h RL1, 24h RL2/3', () => {
    expect(postStormWindowHours(1)).toBe(48);
    expect(postStormWindowHours(2)).toBe(24);
    expect(postStormWindowHours(3)).toBe(24);
  });
});

describe('ND/DNQ cross-field rules (DRF-03)', () => {
  it("valid: '=' with a result", () => {
    expect(ndDnqViolation({ qualifier: '=', result: 7.2 })).toBeNull();
  });
  it('valid: ND with blank result and MDL', () => {
    expect(ndDnqViolation({ qualifier: 'ND', result: null, mdl: 0.1 })).toBeNull();
  });
  it('valid: DNQ with result, MDL and RL', () => {
    expect(
      ndDnqViolation({ qualifier: 'DNQ', result: 0.3, mdl: 0.1, rl: 0.5 })
    ).toBeNull();
  });

  it("invalid: '=' without a result", () => {
    expect(ndDnqViolation({ qualifier: '=', result: null })).toMatch(/requires a numeric result/);
  });
  it('invalid: ND carrying a result value', () => {
    expect(ndDnqViolation({ qualifier: 'ND', result: 0.2, mdl: 0.1 })).toMatch(/must not carry a result/);
  });
  it('invalid: ND missing MDL', () => {
    expect(ndDnqViolation({ qualifier: 'ND', result: null })).toMatch(/requires the MDL/);
  });
  it('invalid: DNQ missing result', () => {
    expect(ndDnqViolation({ qualifier: 'DNQ', result: null, mdl: 0.1, rl: 0.5 })).toMatch(/requires the estimated result/);
  });
  it('invalid: DNQ missing RL', () => {
    expect(ndDnqViolation({ qualifier: 'DNQ', result: 0.3, mdl: 0.1 })).toMatch(/requires both MDL and RL/);
  });
  it('invalid: DNQ missing MDL', () => {
    expect(ndDnqViolation({ qualifier: 'DNQ', result: 0.3, rl: 0.5 })).toMatch(/requires both MDL and RL/);
  });

  it('the web Zod schema now enforces the rules end to end', () => {
    const base = {
      sampleId: 's-1',
      parameter: 'pH' as const,
      units: 'SU',
      analyticalMethod: 'pH_field',
    };
    // ND with a result — the combination the old schema accepted.
    expect(
      parameterResultCreate.safeParse({
        ...base,
        qualifier: 'ND',
        result: 6.5,
        mdl: 0.1,
      }).success
    ).toBe(false);
    // Valid ND.
    expect(
      parameterResultCreate.safeParse({
        ...base,
        qualifier: 'ND',
        result: null,
        mdl: 0.1,
      }).success
    ).toBe(true);
    // '=' without result.
    expect(
      parameterResultCreate.safeParse({ ...base, qualifier: '=' }).success
    ).toBe(false);
    // Plain '=' with result.
    expect(
      parameterResultCreate.safeParse({ ...base, qualifier: '=', result: 7.1 }).success
    ).toBe(true);
  });
});

describe('SMARTS field caps (CMP-03)', () => {
  it('monitoring location names cap at 25 chars', async () => {
    const { monitoringLocationCreate } = await import('@/lib/validations/monitoring-location');
    const base = { projectId: 'p', drainageArea: 'DA-1', dischargePointType: 'Effluent' };
    expect(monitoringLocationCreate.safeParse({ ...base, name: 'x'.repeat(25) }).success).toBe(true);
    expect(monitoringLocationCreate.safeParse({ ...base, name: 'x'.repeat(26) }).success).toBe(false);
  });
});
