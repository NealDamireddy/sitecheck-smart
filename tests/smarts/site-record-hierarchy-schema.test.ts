import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/021_site_record_hierarchy.sql'),
  'utf8'
);

describe('migration 021 company-inspector-site hierarchy', () => {
  it('provides one explicit routing spine for each requested record type', () => {
    for (const table of [
      'inspector_profiles',
      'project_inspector_assignments',
      'site_records',
      'site_record_inspections',
      'smarts_report_records',
    ]) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }

    for (const recordType of [
      'weekly_inspection',
      'monthly_inspection',
      'smarts_ad_hoc',
    ]) {
      expect(sql).toContain(`'${recordType}'`);
    }
    expect(sql).not.toMatch(/record_type IN \([^)]*annual_report/);
  });

  it('requires company membership and an explicit site assignment', () => {
    expect(sql).toMatch(
      /FOREIGN KEY \(user_id, org_id\)[\s\S]*?REFERENCES org_memberships\(user_id, org_id\)/
    );
    expect(sql).toMatch(
      /FOREIGN KEY \(org_id, project_id, inspector_user_id\)[\s\S]*?REFERENCES project_inspector_assignments/
    );
    expect(sql).toContain('idx_site_records_company_inspector_site_type');
    expect(sql).toContain('UNIQUE (org_id, idempotency_key)');
  });

  it('keeps inspection and SMARTS detail in separate typed branches', () => {
    expect(sql).toContain('site_record_inspections_type_guard');
    expect(sql).toContain('smarts_report_records_type_guard');
    expect(sql).toContain('SITE_RECORD_TYPE_MISMATCH');
    expect(sql).toMatch(
      /FOREIGN KEY \(inspection_id, project_id\)[\s\S]*?REFERENCES inspections\(id, project_id\)/
    );
    expect(sql).toMatch(
      /FOREIGN KEY \(smarts_event_id, project_id\)[\s\S]*?REFERENCES smarts_events\(id, project_id\)/
    );
  });
});

describe('migration 021 source, normalized, and audit storage', () => {
  it('retains original inputs and private object metadata with hashes', () => {
    expect(sql).toContain('CREATE TABLE site_record_uploads');
    expect(sql).toContain("DEFAULT 'inspection-records'");
    expect(sql).toContain('storage_path TEXT NOT NULL UNIQUE');
    expect(sql).toContain("sha256 ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain('CREATE TABLE site_record_sources');
    expect(sql).toContain('raw_payload JSONB');
  });

  it('stores immutable versioned bot payloads and durable run linkage', () => {
    expect(sql).toContain('CREATE TABLE smarts_payload_versions');
    expect(sql).toContain('normalized_payload JSONB NOT NULL');
    expect(sql).toContain('UNIQUE (site_record_id, version_number)');
    expect(sql).toContain('ADD COLUMN payload_version_id UUID');
    expect(sql).toContain('smarts_runs_payload_site_record_project_fk');
    expect(sql).toMatch(
      /FOREIGN KEY \(payload_version_id, site_record_id, project_id\)[\s\S]*?REFERENCES smarts_payload_versions\(id, site_record_id, project_id\)/
    );
    expect(sql).not.toMatch(
      /CREATE POLICY smarts_payload_versions_(?:update|delete)/
    );
  });

  it('adds the missing SMARTS entities and cross-project integrity guards', () => {
    expect(sql).toContain('CREATE TABLE drainage_areas');
    expect(sql).toContain('ADD COLUMN drainage_area_id UUID');
    expect(sql).toContain('ADD COLUMN water_body TEXT');
    expect(sql).toContain('CREATE TABLE smarts_attachments');
    expect(sql).toContain("'inspector_upload'");
    for (const constraint of [
      'samples_event_project_fk',
      'samples_location_project_fk',
      'parameter_results_sample_project_fk',
    ]) {
      expect(sql).toContain(constraint);
    }
  });

  it('makes source and payload rows append-only to normal users', () => {
    for (const table of ['site_record_sources', 'smarts_payload_versions']) {
      expect(sql).toContain(`CREATE POLICY ${table}_select`);
      expect(sql).toContain(`CREATE POLICY ${table}_insert`);
      expect(sql).not.toMatch(
        new RegExp(`CREATE POLICY ${table}_(?:update|delete)`)
      );
    }
  });

  it('allows status history only through the database trigger', () => {
    expect(sql).toContain('CREATE POLICY site_record_status_history_select');
    expect(sql).not.toMatch(
      /CREATE POLICY site_record_status_history_(?:insert|update|delete)/
    );
    expect(sql).toMatch(
      /FUNCTION public\.record_site_record_status_change\(\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/
    );
  });

  it('uses authenticated-only policies and explicit least-privilege grants', () => {
    expect(sql).toContain('TO authenticated');
    expect(sql).toMatch(/REVOKE ALL ON TABLE[\s\S]*?FROM anon/);
    expect(sql).toContain('inspector_user_id = (SELECT auth.uid())');
    expect(sql).toContain('created_by = (SELECT auth.uid())');
    expect(sql).toContain('private.auth_user_can_manage_org');
    expect(sql).toContain('private.auth_user_can_write_site_record');
    expect(sql).toContain('private.auth_user_can_manage_project');
  });

  it('indexes foreign-key paths used for auth deletion and child cleanup', () => {
    for (const index of [
      'idx_inspector_profiles_user',
      'idx_project_inspector_assignments_assigned_by',
      'idx_site_records_created_by',
      'idx_site_record_uploads_uploaded_by',
      'idx_site_record_sources_upload',
      'idx_site_record_sources_captured_by',
      'idx_smarts_payload_versions_created_by',
      'idx_smarts_attachments_upload',
      'idx_site_record_status_history_changed_by',
      'idx_monitoring_locations_drainage_area_project',
      'idx_samples_event_project',
      'idx_samples_location_project',
    ]) {
      expect(sql).toContain(index);
    }
  });
});
