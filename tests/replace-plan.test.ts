import { describe, expect, it } from 'vitest';
import {
  planParameterReplace,
  type IncomingParameterResult,
} from '@/lib/samples/replace-plan';

function incoming(
  parameter: string,
  overrides: Partial<IncomingParameterResult> = {}
): IncomingParameterResult {
  return {
    parameter,
    qualifier: '=',
    result: 7.2,
    units: 'SU',
    analytical_method: 'pH_field',
    mdl: null,
    rl: null,
    analyzed_by: 'Self',
    ...overrides,
  };
}

describe('planParameterReplace (SEC-06)', () => {
  it('inserts everything on a fresh sample', () => {
    const plan = planParameterReplace([], [incoming('pH'), incoming('Turbidity')]);
    expect(plan.updates).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.inserts.map((r) => r.parameter)).toEqual(['pH', 'Turbidity']);
  });

  it('updates existing rows in place instead of delete+insert', () => {
    const plan = planParameterReplace(
      [
        { id: 'row-ph', parameter: 'pH' },
        { id: 'row-turb', parameter: 'Turbidity' },
      ],
      [incoming('pH', { result: 8.1 }), incoming('Turbidity', { units: 'NTU' })]
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.updates).toHaveLength(2);
    expect(plan.updates[0]).toMatchObject({ id: 'row-ph' });
    expect(plan.updates[0].values.result).toBe(8.1);
    expect(plan.updates[1]).toMatchObject({ id: 'row-turb' });
  });

  it('only deletes rows whose parameter is absent from the incoming set', () => {
    const plan = planParameterReplace(
      [
        { id: 'row-ph', parameter: 'pH' },
        { id: 'row-turb', parameter: 'Turbidity' },
      ],
      [incoming('pH')]
    );
    expect(plan.updates.map((u) => u.id)).toEqual(['row-ph']);
    expect(plan.inserts).toEqual([]);
    expect(plan.deleteIds).toEqual(['row-turb']);
  });

  it('mixes update, insert and delete correctly', () => {
    const plan = planParameterReplace(
      [{ id: 'row-turb', parameter: 'Turbidity' }],
      [incoming('pH')]
    );
    expect(plan.updates).toEqual([]);
    expect(plan.inserts.map((r) => r.parameter)).toEqual(['pH']);
    expect(plan.deleteIds).toEqual(['row-turb']);
  });

  it('never plans a delete for a parameter still present (data-loss guard)', () => {
    // Property-style sweep over all subsets of {pH, Turbidity}.
    const params = ['pH', 'Turbidity'];
    for (const existingSet of [[], ['pH'], ['Turbidity'], params]) {
      for (const incomingSet of [[], ['pH'], ['Turbidity'], params]) {
        const plan = planParameterReplace(
          existingSet.map((p) => ({ id: `row-${p}`, parameter: p })),
          incomingSet.map((p) => incoming(p))
        );
        for (const id of plan.deleteIds) {
          const parameter = id.replace('row-', '');
          expect(incomingSet).not.toContain(parameter);
        }
      }
    }
  });
});
