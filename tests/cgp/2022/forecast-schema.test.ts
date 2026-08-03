import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/017_cgp_forecast_evidence.sql'),
  'utf8'
);

describe('migration 017 forecast evidence', () => {
  it('creates immutable snapshot and normalized interval tables', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS cgp_forecast_snapshots');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS cgp_forecast_intervals');
    expect(sql).toContain('raw_payload JSONB NOT NULL');
    expect(sql).toContain('payload_sha256 TEXT NOT NULL');
    expect(sql).toContain('parser_version TEXT NOT NULL');
    expect(sql).toContain('normalization_status TEXT NOT NULL');
    expect(sql).toContain('normalization_reason_codes JSONB NOT NULL');
  });

  it('enables RLS for both tables', () => {
    expect(sql).toContain('ALTER TABLE cgp_forecast_snapshots ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE cgp_forecast_intervals ENABLE ROW LEVEL SECURITY');
  });

  it('allows authenticated select and insert but defines no update/delete policy', () => {
    for (const table of ['cgp_forecast_snapshots', 'cgp_forecast_intervals']) {
      expect(sql).toContain(`\"${table}_select\"`);
      expect(sql).toContain(`\"${table}_insert\"`);
      expect(sql).not.toContain(`\"${table}_update\"`);
      expect(sql).not.toContain(`\"${table}_delete\"`);
    }
  });

  it('requires interval rows to reference a snapshot for the same project', () => {
    expect(sql).toContain(
      'WHERE snapshot.project_id = cgp_forecast_intervals.project_id'
    );
  });

  it('captures the snapshot and intervals through one invoker-rights transaction', () => {
    expect(sql).toContain('FUNCTION capture_cgp_forecast_evidence');
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain('INSERT INTO cgp_forecast_snapshots');
    expect(sql).toContain('INSERT INTO cgp_forecast_intervals');
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION capture_cgp_forecast_evidence(JSONB, JSONB) FROM PUBLIC'
    );
    expect(sql).toMatch(
      /SELECT\s+item->>'id',\s+captured_snapshot_id,\s+p_snapshot->>'project_id'/
    );
  });
});
