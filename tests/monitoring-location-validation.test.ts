/**
 * MON-01 and MON-02, found during the 2026-08-08 production run.
 *
 * A second monitoring location could not be saved: new rows are seeded with an
 * empty `drainageArea`, which the API requires, and the resulting 400 rendered
 * as "[object Object]" because the route returned Zod's issues array and the
 * wizard interpolated it into a template string. The user was told something
 * failed but never what.
 */
import { describe, expect, it } from 'vitest';
import { formatZodIssues, readErrorMessage } from '@/lib/api-error';
import { findIncompleteLocations } from '@/components/projects/monitoring-locations-builder';
import type { MonitoringLocationDraft } from '@/components/projects/monitoring-locations-builder';

function draft(over: Partial<MonitoringLocationDraft> = {}): MonitoringLocationDraft {
  return {
    id: 'mloc-1',
    name: 'Outfall 1',
    drainageArea: 'DA-1, 4.2 ac',
    dischargePointType: 'Effluent',
    isAts: false,
    isPassiveTreatment: false,
    ...over,
  };
}

describe('MON-01 — incomplete monitoring locations are caught before saving', () => {
  it('accepts a fully filled row', () => {
    expect(findIncompleteLocations([draft()])).toEqual([]);
  });

  it('flags the blank drainage area a new row starts with', () => {
    const problems = findIncompleteLocations([draft({ drainageArea: '' })]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('drainage area is required');
  });

  it('treats whitespace as blank', () => {
    expect(findIncompleteLocations([draft({ drainageArea: '   ' })])).toHaveLength(1);
  });

  it('names the offending row so the user knows which one', () => {
    const problems = findIncompleteLocations([
      draft({ name: 'Outfall A' }),
      draft({ name: 'Outfall B', drainageArea: '' }),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Outfall B');
  });

  it('rejects names past the 25-character SMARTS limit', () => {
    const problems = findIncompleteLocations([draft({ name: 'x'.repeat(26) })]);
    expect(problems[0]).toContain('25 characters');
  });

  it('falls back to a positional label when the name is blank too', () => {
    const problems = findIncompleteLocations([draft({ name: '', drainageArea: '' })]);
    expect(problems.some((p) => p.includes('Location 1'))).toBe(true);
  });
});

describe('MON-02 — validation errors reach the user as words', () => {
  it('renders Zod issues as field: message', () => {
    const out = formatZodIssues([
      { path: ['drainageArea'], message: 'drainageArea is required' },
    ]);
    expect(out).toBe('drainageArea: drainageArea is required');
  });

  it('joins multiple issues', () => {
    const out = formatZodIssues([
      { path: ['name'], message: 'Too long' },
      { path: ['drainageArea'], message: 'Required' },
    ]);
    expect(out).toBe('name: Too long, drainageArea: Required');
  });

  it('never returns an empty string', () => {
    expect(formatZodIssues([])).toBe('Validation failed');
  });

  it('reads a plain string error body', () => {
    expect(readErrorMessage({ error: 'Missing projectId' }, 'fallback')).toBe(
      'Missing projectId'
    );
  });

  it('reads an array-of-issues error body — the actual bug', () => {
    const body = { error: [{ path: ['drainageArea'], message: 'drainageArea is required' }] };
    const msg = readErrorMessage(body, 'HTTP 400');
    expect(msg).toContain('drainageArea is required');
    // The regression itself: this must never stringify to [object Object].
    expect(msg).not.toContain('[object Object]');
  });

  it('falls back rather than stringifying an unrecognised shape', () => {
    expect(readErrorMessage({ weird: { nested: 1 } }, 'HTTP 500')).toBe('HTTP 500');
    expect(readErrorMessage(undefined, 'HTTP 500')).toBe('HTTP 500');
  });

  it('template interpolation now produces readable text end to end', () => {
    const body = { error: [{ path: ['drainageArea'], message: 'drainageArea is required' }] };
    const rendered = `Outfall B: ${readErrorMessage(body, 'HTTP 400')}`;
    expect(rendered).toBe('Outfall B: drainageArea: drainageArea is required');
    expect(`${body.error}`).toContain('[object Object]'); // what the user saw before
  });
});
