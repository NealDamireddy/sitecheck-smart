import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/025_phase4_foreign_key_indexes.sql'
  ),
  'utf8'
);

describe('Phase 4 foreign-key indexes migration', () => {
  const expectedIndexes = [
    'idx_site_record_inspections_inspection_project',
    'idx_site_record_inspections_record_project',
    'idx_site_record_sources_record_project',
    'idx_site_record_sources_upload_record_project',
    'idx_site_record_uploads_record_project',
    'idx_site_records_org_project',
    'idx_site_records_assignment_fk',
    'idx_smarts_attachments_record_project',
    'idx_smarts_payload_versions_record_project',
    'idx_smarts_report_records_event_project',
  ];

  it.each(expectedIndexes)('creates %s', (indexName) => {
    expect(sql).toContain(`CREATE INDEX IF NOT EXISTS ${indexName}`);
  });
});
