import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/023_site_record_read_model_storage.sql'
  ),
  'utf8'
);

describe('migration 023 hierarchy read model', () => {
  it('exposes one security-invoker company-inspector-site directory', () => {
    expect(sql).toContain('VIEW public.site_record_directory');
    expect(sql).toContain('security_invoker = true');
    expect(sql).toContain('company_name');
    expect(sql).toContain('inspector_name');
    expect(sql).toContain('site_name');
    expect(sql).toContain('record.record_type');
    expect(sql).toContain('inspection.inspection_id');
    expect(sql).toContain('smarts.smarts_event_id');
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.site_record_directory FROM PUBLIC, anon/
    );
  });
});

describe('migration 023 private inspection-record storage', () => {
  it('creates a private, size-limited bucket for supported source files', () => {
    expect(sql).toContain("'inspection-records'");
    expect(sql).toContain('FALSE');
    expect(sql).toContain('52428800');
    expect(sql).toContain("'application/pdf'");
    expect(sql).toContain("'text/csv'");
    expect(sql).toContain("'image/jpeg'");
  });

  it('removes the live blanket policy before installing scoped rules', () => {
    expect(sql).toContain(
      'DROP POLICY IF EXISTS allow_all_storage ON storage.objects'
    );
    expect(sql).toContain('CREATE POLICY inspection_records_select');
    expect(sql).toContain('CREATE POLICY inspection_records_insert');
    expect(sql).toContain("bucket_id = 'inspection-records'");
    expect(sql).toContain('record.inspector_user_id = (SELECT auth.uid())');
  });

  it('binds all six object-path folders to normalized record identity', () => {
    for (const index of [1, 2, 3, 4, 5, 6]) {
      expect(sql).toContain(`(storage.foldername(name))[${index}]`);
    }
    expect(sql).not.toMatch(/CREATE POLICY inspection_records_(?:update|delete)/);
  });
});
