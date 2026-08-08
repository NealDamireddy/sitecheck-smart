import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/026_sync_field_record_workflow_status.sql'
  ),
  'utf8'
);
const fixSql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/027_fix_smarts_workflow_trigger.sql'
  ),
  'utf8'
);

describe('Phase 4 field-record workflow synchronization', () => {
  it('syncs inspection completion into the common record directory', () => {
    expect(sql).toContain('CREATE TRIGGER sync_inspection_site_record_status');
    expect(sql).toMatch(/WHEN 'submitted' THEN 'verified'/);
  });

  it('syncs SMARTS link creation and later event transitions', () => {
    expect(sql).toContain('CREATE TRIGGER sync_smarts_record_on_link');
    expect(sql).toContain('CREATE TRIGGER sync_smarts_record_on_event');
    expect(sql).toMatch(/WHEN 'completed' THEN 'verified'/);
  });

  it('does not expose trigger functions as callable authenticated RPCs', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.sync_inspection_site_record_status\(\)[\s\S]*?FROM PUBLIC, anon, authenticated/
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.sync_smarts_site_record_status\(\)[\s\S]*?FROM PUBLIC, anon, authenticated/
    );
  });

  it('resolves table-specific SMARTS event ids without polymorphic NEW errors', () => {
    expect(fixSql).toMatch(
      /IF TG_TABLE_NAME = 'smarts_report_records' THEN\s+v_event_id := NEW\.smarts_event_id;\s+ELSE\s+v_event_id := NEW\.id;/
    );
    expect(fixSql).not.toMatch(/TEXT := CASE/);
  });
});
